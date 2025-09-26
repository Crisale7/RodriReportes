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

type Registro = {
  id: string;
  horaInicio: string;
  horaFin: string;
  correo: string;
  nombre: string;
  ubicacion: string;
  encargado: string;
  fechaReporte: Date | null;
  momento: string;
  totalCamaras: number;
  operativasHoy: string;
  malaCalidad?: string;
  camsConFalla: number;
  detalleFallas?: string;
  fallaTipo?: string;
  fallasGenerales?: string;
  observaciones?: string;
  adjuntos?: string;
  recomendacion?: string;
  raw?: any;
};

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
    ResumenComponent
  ]
})
export class HomePage implements OnDestroy {
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

  onFileSelected(evt: Event) {
    const input = evt.target as HTMLInputElement;
    if (!input.files || !input.files.length) return;

    const file = input.files[0];
    this.fileName = file.name;

    const reader = new FileReader();
    reader.onload = () => {
      const csvText = (reader.result ?? '') as string;

      interface PapaParseResult<T> {
        data: T[];
        errors: any[];
        meta: any;
      }

      interface PapaParseConfig<T> {
        header?: boolean;
        skipEmptyLines?: boolean;
        encoding?: string;
        delimiter?: string;
        quoteChar?: string;
        transformHeader?: (header: string) => string;
        complete?: (result: PapaParseResult<T>) => void;
        error?: (error: any) => void;
      }

      Papa.parse<any>(csvText, {
        header: true,
        skipEmptyLines: true,
        encoding: 'UTF-8',
        delimiter: ',',
        quoteChar: '"',
        transformHeader: (h: string) => this.cleanHeader(h),
        complete: (result: PapaParseResult<any>) => {
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
      } as PapaParseConfig<any>);
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

  private nextFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  async exportPDF() {
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

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const imgProps = (pdf as any).getImageProperties(imgData);
      const margin = 5;
      const pdfWidth = pageWidth - margin * 2;
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      let position = margin;
      let heightLeft = pdfHeight;

      pdf.addImage(imgData, 'PNG', margin, position, pdfWidth, pdfHeight, '', 'FAST');
      heightLeft -= pageHeight;

      while (heightLeft > -pageHeight) {
        pdf.addPage();
        position = 0;
        pdf.addImage(imgData, 'PNG', margin, position - (pdfHeight - heightLeft), pdfWidth, pdfHeight, '', 'FAST');
        heightLeft -= pageHeight;
      }

      pdf.save(this.suggestedPdfName());
    } catch (err) {
      console.error('Error al exportar PDF:', err);
      alert('No se pudo exportar el PDF. Se limpió el clon, prueba nuevamente.');
    }
  }

  private suggestedPdfName(): string {
    const today = new Date();
    const fmt = (n: number) => String(n).padStart(2, '0');
    const fecha = `${today.getFullYear()}-${fmt(today.getMonth() + 1)}-${fmt(today.getDate())}`;
    const ub = this.filters.ubicacion || 'Todas';
    return `Reporte_Camaras_${ub}_${fecha}.pdf`;
  }

  ngOnDestroy(): void {}
}
