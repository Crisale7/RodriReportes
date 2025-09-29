import { Component, OnDestroy } from '@angular/core';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonButtons,
  IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent,
  IonItem, IonLabel, IonSelect, IonSelectOption, IonNote, IonChip, IonIcon
} from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import Papa from 'papaparse';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

import { MetricasComponent } from '../components/metricas/metricas.component';
import { ResumenComponent } from '../components/resumen/resumen.component';
import { RegistrosComponent, Registro } from '../components/registros/registros.component';

type Metrics = {
  totalCamaras: number;
  operativasInterpretadas: number;
  camarasConFalla: number;
};

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonButtons,
    IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent,
    IonItem, IonLabel, IonSelect, IonSelectOption, IonNote, IonChip, IonIcon,
    MetricasComponent,
    ResumenComponent,
    RegistrosComponent
  ]
})
export class HomePage implements OnDestroy {

   private safeBreaksCss: number[] = []; // en px de CSS del DOM CLONADO
  fileName = '';
  parsed = false;

  rows: Registro[] = [];
  filtered: Registro[] = [];

  filters = {
    fechaDesde: '' as string,
    fechaHasta: '' as string,
    ubicacion: '' as string,
    encargado: '' as string,
    momento: '' as string,
    operativas: '' as string,
    dateStart: null as Date | null,
    dateEnd: null as Date | null
  };

  lookups = {
    fechas: [] as string[],
    ubicaciones: [] as string[],
    encargados: [] as string[],
    momentos: [] as string[],
    operativas: ['Todas', 'Mas de la Mitad', 'Menos de la Mitad', 'No'] as string[]
  };

  metrics: Metrics = {
    totalCamaras: 0,
    operativasInterpretadas: 0,
    camarasConFalla: 0
  };

  resumen = {
    periodo: '',
    destacados: [] as string[]
  };

  constructor() {}

  // === CSV ===
  onFileSelected(evt: Event) {
    const input = evt.target as HTMLInputElement;
    if (!input.files || !input.files.length) return;

    const file = input.files[0];
    this.fileName = file.name;

    const reader = new FileReader();
    reader.onload = () => {
      const csvText = (reader.result ?? '') as string;

      Papa.parse<any>(csvText, {
        header: true,
        skipEmptyLines: true,
        encoding: 'UTF-8',
        delimiter: ',',
        quoteChar: '"',
        transformHeader: (h: string) => this.cleanHeader(h),
        complete: (result) => {
          try {
            const data: Registro[] = (result.data as any[]).map((r: any) => this.mapRow(r));
            this.rows = data.filter((d: Registro) => !!d.id || !!d.ubicacion || !!d.encargado);
            this.parsed = true;

            this.buildLookups();
            this.resetFilters(false);
            this.applyFilters();
          } catch (e) {
            console.error(e);
            this.parsed = false;
            alert('Error al procesar el CSV. Revisa el formato de columnas.');
          }
        },
        error: (err: any) => {
          console.error(err);
          alert('No se pudo leer el CSV. Verifica codificación UTF-8 y separadores.');
        }
      });
    };
    reader.onerror = (e) => {
      console.error(e);
      alert('No se pudo abrir el archivo seleccionado.');
    };
    reader.readAsText(file, 'UTF-8');
  }

  private cleanHeader(h: string): string {
    const noBom = h.replace(/^\uFEFF/, '');
    return noBom.trim().replace(/\s+/g, ' ').replace(/_/g, ' ').toLowerCase();
  }

  private mapRow(r: any): Registro {
    const get = (keys: string[], def: any = '') => {
      for (const k of keys) {
        const kk = k.toLowerCase();
        if (Object.prototype.hasOwnProperty.call(r, kk) && r[kk] != null) return String(r[kk]).trim();
      }
      return def;
    };

    const fechaRaw = get(['fecha del reporte', 'fecha reporte', 'fecha']);
    const fecha = this.parseDate(fechaRaw);

    const totalCams = this.toNumber(get([
      '¿cuántas cámaras en total están instaladas en la ubicación?',
      'cuantas camaras en total estan instaladas en la ubicacion?',
      'cámaras totales', 'total camaras', 'total cámaras'
    ]), 0);

    const camsFalla = this.toNumber(get([
      'indicar el número de cámaras que se encuentran con el fallo, de lo contrario ingresa "0"',
      'indicar el numero de camaras que se encuentran con el fallo, de lo contrario ingresa "0"',
      'cámaras con falla', 'camaras con falla'
    ]), 0);

    return {
      id: get(['id']),
      horaInicio: get(['hora de inicio', 'hora inicio']),
      horaFin: get(['hora de finalización', 'hora de finalizacion', 'hora fin']),
      correo: get(['correo electrónico', 'correo electronico', 'email']),
      nombre: get(['nombre']),
      ubicacion: get(['ubicación', 'ubicacion']),
      encargado: get(['nombre del encargado', 'encargado']),
      fechaReporte: fecha,
      momento: get(['momento de verificación de cámaras', 'momento de verificacion de camaras', 'momento']),
      totalCamaras: totalCams,
      operativasHoy: get(['¿cuántas cámaras están operativas hoy?', 'cuantas camaras estan operativas hoy?', 'operativas hoy']),
      malaCalidad: get(['¿se detectaron cámaras con mala calidad de imagen, obstruidas o con interferencias?', 'se detectaron camaras con mala calidad de imagen, obstruidas o con interferencias?']),
      camsConFalla: camsFalla,
      detalleFallas: get(['detalla qué cámaras son las que presentan fallas, ubicación, nombre, modelo.', 'detalla que camaras son las que presentan fallas, ubicacion, nombre, modelo.']),
      fallaTipo: get(['indicar  fallo y el tipo de fallo en las cámaras, de lo contrario ingresa "sin observaciones"', 'indicar fallo y el tipo de fallo en las camaras, de lo contrario ingresa "sin observaciones"']),
      fallasGenerales: get(['¿se detectaron fallas técnicas generales en el sistema?', 'se detectaron fallas tecnicas generales en el sistema?']),
      observaciones: get(['observaciones que pudiste encontrar acerca del monitoreo', 'observaciones']),
      adjuntos: get(['adjuntar imágenes o documentos del fallo y/o observaciones', 'adjuntar imagenes o documentos del fallo y/o observaciones', 'adjuntos']),
      recomendacion: get(['¿alguna recomendación o sugerencia?', 'alguna recomendacion o sugerencia?']),
      raw: r
    };
  }

  private parseDate(v: string): Date | null {
    if (!v) return null;
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
    const m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (m) {
      const mm = parseInt(m[1], 10) - 1;
      const dd = parseInt(m[2], 10);
      const yy = parseInt(m[3], 10);
      const dt = new Date(yy, mm, dd);
      return isNaN(dt.getTime()) ? null : dt;
    }
    return null;
  }

  private toNumber(v: string, def = 0): number {
    if (!v) return def;
    const n = Number(String(v).replace(/[^\d.-]/g, ''));
    return isNaN(n) ? def : n;
  }

  // === Filtros ===
  private buildLookups() {
    const uniq = (arr: (string | undefined | null)[]) => [...new Set(arr.filter((x): x is string => !!x))];

    const fechas = uniq(
      this.rows.map(r => r.fechaReporte ? this.dateToKey(r.fechaReporte) : null)
    ).sort();

    this.lookups.fechas = fechas;
    this.lookups.ubicaciones = uniq(this.rows.map(r => r.ubicacion)).sort();
    this.lookups.encargados = uniq(this.rows.map(r => r.encargado)).sort();
    this.lookups.momentos = uniq(this.rows.map(r => r.momento)).sort();
  }

  private dateToKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private keyToDate(key: string): Date | null {
    if (!key) return null;
    const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    const d = parseInt(m[3], 10);
    const dt = new Date(y, mo, d);
    return isNaN(dt.getTime()) ? null : dt;
  }

  onFechaSelectChange() {
    this.filters.dateStart = this.filters.fechaDesde ? this.keyToDate(this.filters.fechaDesde) : null;
    this.filters.dateEnd = this.filters.fechaHasta ? this.keyToDate(this.filters.fechaHasta) : null;
    this.applyFilters();
  }

  resetFilters(apply = true) {
    this.filters = {
      fechaDesde: '',
      fechaHasta: '',
      ubicacion: '',
      encargado: '',
      momento: '',
      operativas: '',
      dateStart: null,
      dateEnd: null
    };
    if (apply) this.applyFilters();
  }

  applyFilters() {
    const inRange = (d: Date | null) => {
      if (!d) return true;
      if (this.filters.dateStart && d < this.stripTime(this.filters.dateStart)) return false;
      if (this.filters.dateEnd && d > this.stripTimeEnd(this.filters.dateEnd)) return false;
      return true;
    };

    this.filtered = this.rows.filter(r => {
      if (this.filters.ubicacion && r.ubicacion !== this.filters.ubicacion) return false;
      if (this.filters.encargado && r.encargado !== this.filters.encargado) return false;
      if (this.filters.momento && r.momento !== this.filters.momento) return false;
      if (this.filters.operativas && r.operativasHoy !== this.filters.operativas) return false;
      if (!inRange(r.fechaReporte)) return false;
      return true;
    });

    this.buildResumen();
  }

  private stripTime(d: Date) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  private stripTimeEnd(d: Date) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  }

  private buildResumen() {
    const pStart = this.filters.dateStart ? this.dateToKey(this.filters.dateStart) : '';
    const pEnd = this.filters.dateEnd ? this.dateToKey(this.filters.dateEnd) : '';
    this.resumen.periodo = (pStart || pEnd) ? `${pStart || '...'} a ${pEnd || '...'}` : 'Todo';

    this.resumen.destacados = this.filtered
      .filter(r =>
        (r.camsConFalla || 0) > 0 ||
        /emergencia|daños|da\u00f1os|sospechosa/i.test(`${r.fallasGenerales} ${r.fallaTipo}`))
      .slice(0, 5)
      .map(r => `#${r.id} - ${r.ubicacion}: ${r.camsConFalla} cam(s) con falla. ${r.recomendacion || ''}`.trim());
  }

  onMetricsChange(m: Metrics) {
    this.metrics = m;
  }

// Reemplaza exportPDF() por esta versión de exportación a imagen
private nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async exportImage(format: 'png' | 'jpeg' = 'png', quality = 0.92) {
  const element = document.getElementById('reportArea');
  if (!element) return;

  try {
    await this.nextFrame();

    const canvas = await html2canvas(element, {
      scale: window.devicePixelRatio || 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      onclone: (clonedDoc) => {
        clonedDoc.body.classList.add('exporting');
        // Limpieza de estilos que rompen el render
        clonedDoc.querySelectorAll('link[rel="stylesheet"]').forEach(n => n.remove());
        clonedDoc.querySelectorAll('style').forEach(n => n.remove());

        const BAD_PAT = /(oklch|color-mix|conic-gradient|radial-gradient|linear-gradient)/i;
        clonedDoc.querySelectorAll<HTMLElement>('*').forEach(el => {
          const inl = el.getAttribute('style') || '';
          if (BAD_PAT.test(inl)) el.removeAttribute('style');
          (el as HTMLElement).style.setProperty('--background', '#ffffff');
          (el as HTMLElement).style.setProperty('background', '#ffffff', 'important');
        });

        const safe = clonedDoc.createElement('style');
        safe.textContent = `
          * {
            background: #ffffff !important;
            background-image: none !important;
            box-shadow: none !important;
            text-shadow: none !important;
            border-color: #e5e7eb !important;
            color: #111827 !important;
          }
          body, ion-content { --background: #ffffff !important; }
          #reportArea, ion-card, .resumen p, .resumen ul, .resumen ul li, .table-responsive {
            background: #ffffff !important;
            border: 1px solid #e5e7eb !important;
          }
        `;
        clonedDoc.head.appendChild(safe);
      },
    });

    // Genera el blob de imagen
    const mime = format === 'png' ? 'image/png' : 'image/jpeg';
    const dataUrl = canvas.toDataURL(mime, quality);

    // Dispara la descarga
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = this.suggestedImageName(format);
    document.body.appendChild(link);
    link.click();
    link.remove();

  } catch (err) {
    console.error('Error al exportar imagen:', err);
    alert('No se pudo exportar la imagen. Intenta nuevamente.');
  }
}

private suggestedImageName(format: 'png' | 'jpeg'): string {
  const today = new Date();
  const fmt = (n: number) => String(n).padStart(2, '0');
  const fecha = `${today.getFullYear()}-${fmt(today.getMonth() + 1)}-${fmt(today.getDate())}`;
  const ub = this.filters.ubicacion || 'Todas';
  const ext = format === 'png' ? 'png' : 'jpg';
  return `Reporte_Camaras_${ub}_${fecha}.${ext}`;
}

  ngOnDestroy(): void {}

async exportPDF() {
  const container = document.getElementById('reportArea');
  if (!container) return;

  try {
    await this.nextFrame();

    let clonedContainerWidth = 0; // capturaremos el ancho del contenedor clonado

    const canvas = await html2canvas(container, {
      scale: window.devicePixelRatio || 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      onclone: (clonedDoc) => {
        clonedDoc.body.classList.add('exporting');

        // limpieza de estilos
        clonedDoc.querySelectorAll('link[rel="stylesheet"]').forEach(n => n.remove());
        clonedDoc.querySelectorAll('style').forEach(n => n.remove());
        const BAD_PAT = /(oklch|color-mix|conic-gradient|radial-gradient|linear-gradient)/i;
        clonedDoc.querySelectorAll<HTMLElement>('*').forEach(el => {
          const inl = el.getAttribute('style') || '';
          if (BAD_PAT.test(inl)) el.removeAttribute('style');
          (el as HTMLElement).style.setProperty('--background', '#ffffff');
          (el as HTMLElement).style.setProperty('background', '#ffffff', 'important');
        });
        const safe = clonedDoc.createElement('style');
        safe.textContent = `
          * { background:#fff !important; background-image:none !important; box-shadow:none !important;
              text-shadow:none !important; border-color:#e5e7eb !important; color:#111827 !important; }
          body, ion-content { --background:#fff !important; }
          #reportArea, ion-card, .resumen p, .resumen ul, .resumen li, .table-responsive {
            background:#fff !important; border:1px solid #e5e7eb !important;
          }
        `;
        clonedDoc.head.appendChild(safe);

        // ==== NUEVO: calcular cortes con el DOM CLONADO ====
        const clonedContainer = clonedDoc.getElementById('reportArea') as HTMLElement | null;
        this.safeBreaksCss = [];
        if (clonedContainer) {
          clonedContainerWidth = clonedContainer.clientWidth;

          const containerRect = clonedContainer.getBoundingClientRect();
          const getBottom = (el: Element) => {
            const r = (el as HTMLElement).getBoundingClientRect();
            return (r.bottom - containerRect.top); // px CSS relativos al inicio de reportArea clonado
          };

          const selectors = [
            '#reportArea > ion-card',
            '.no-split',
            'ion-card',
            '.resumen li'
          ];
          const candidates = Array
            .from(clonedContainer.querySelectorAll(selectors.join(',')))
            .map(getBottom)
            .filter(y => y > 0)
            .sort((a, b) => a - b);

          // de-dup
          const MIN_GAP = 24;
          for (const y of candidates) {
            if (!this.safeBreaksCss.length ||
                Math.abs(y - this.safeBreaksCss[this.safeBreaksCss.length - 1]) > MIN_GAP) {
              this.safeBreaksCss.push(Math.round(y));
            }
          }
        }
        // ================================================
      },
    });

    // ==== convertir cortes CSS -> píxeles del canvas ====
    const scaleFactor = clonedContainerWidth ? (canvas.width / clonedContainerWidth) : 1;
    const uniqueBreaks = this.safeBreaksCss.map(y => Math.round(y * scaleFactor));

    // ===== PDF base
    const autoOrientation: 'p' | 'l' = canvas.width >= canvas.height ? 'l' : 'p';
    const pdf = new jsPDF({ orientation: autoOrientation, unit: 'mm', format: 'a4' });

    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const marginMM = 10;
    const usableWmm = pageW - marginMM * 2;
    const imgWmm = usableWmm;
    const imgHmm = (canvas.height * imgWmm) / canvas.width;

    const pxPerMM = canvas.height / imgHmm;
    const usableHPx = (pageH - marginMM * 2) * pxPerMM;

    // ===== slicing SIN cortar elementos
    const slices: Array<{ y: number; h: number; }> = [];
    let y = 0;
    const TOLERANCE = 32;
    const MIN_SLICE = 120;

    while (y < canvas.height) {
      const target = y + usableHPx;
      const candidatesInWindow = uniqueBreaks.filter(b => b <= target && b >= y + MIN_SLICE);
      let end = candidatesInWindow.length ? candidatesInWindow[candidatesInWindow.length - 1] : target;

      if ((target - end) > TOLERANCE) end = target;
      if (end > canvas.height) end = canvas.height;
      if (end <= y) end = Math.min(canvas.height, y + usableHPx); // guard

      slices.push({ y, h: Math.max(1, Math.round(end - y)) });
      y = end;
    }

    const tmp = document.createElement('canvas');
    const tctx = tmp.getContext('2d')!;

    for (let i = 0; i < slices.length; i++) {
      const { y: sy, h: sh } = slices[i];
      tmp.width = canvas.width;
      tmp.height = sh;
      tctx.clearRect(0, 0, tmp.width, tmp.height);
      tctx.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, tmp.width, sh);

      const sliceHmm = sh / pxPerMM;
      const data = tmp.toDataURL('image/png', 1);

      if (i > 0) pdf.addPage();
      pdf.addImage(data, 'PNG', marginMM, marginMM, imgWmm, sliceHmm, undefined, 'FAST');
    }

    pdf.save(this.suggestedPdfName());
  } catch (err) {
    console.error('Error al exportar PDF:', err);
    alert('No se pudo exportar el PDF. Intenta nuevamente.');
  }
}


private suggestedPdfName(): string {
  const today = new Date();
  const fmt = (n: number) => String(n).padStart(2, '0');
  const fecha = `${today.getFullYear()}-${fmt(today.getMonth() + 1)}-${fmt(today.getDate())}`;
  const ub = this.filters.ubicacion || 'Todas';
  return `Reporte_Camaras_${ub}_${fecha}.pdf`;
}

}
