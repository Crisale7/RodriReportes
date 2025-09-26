import { Component, OnDestroy } from '@angular/core';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonButtons,
  IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent,
  IonItem, IonLabel, IonSelect, IonSelectOption, IonNote, IonChip, IonIcon
} from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// CSV parse robusto
import Papa from 'papaparse';

// Chart.js (auto registra controllers/escalas)
import Chart from 'chart.js/auto';

// Exportación a PDF (pantalla completa seleccionada)
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

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

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonButtons,
    IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent,
    IonItem, IonLabel, IonSelect, IonSelectOption, IonNote, IonChip, IonIcon
  ]
})
export class HomePage implements OnDestroy {
  fileName = '';
  parsed = false;

  // Datos
  rows: Registro[] = [];
  filtered: Registro[] = [];

  // Filtros
  filters = {
    // dropdowns de fecha (strings "yyyy-MM-dd")
    fechaDesde: '' as string,
    fechaHasta: '' as string,

    // filtros existentes
    ubicacion: '' as string,
    encargado: '' as string,
    momento: '' as string,
    operativas: '' as string,

    // rango calculado internamente a partir de los dropdowns
    dateStart: null as Date | null,
    dateEnd: null as Date | null
  };

  // Lookups
  lookups = {
    fechas: [] as string[],
    ubicaciones: [] as string[],
    encargados: [] as string[],
    momentos: [] as string[],
    operativas: ['Todas', 'Mas de la Mitad', 'Menos de la Mitad', 'No'] as string[]
  };

  // Métricas + Resumen
  metrics = {
    totalCamaras: 0,
    operativasInterpretadas: 0,
    camarasConFalla: 0
  };

  resumen = {
    periodo: '',
    destacados: [] as string[]
  };

  // Charts
  private charts: Chart[] = [];
  private fillerTextPlugin: any;

  constructor() {
    // Tipografía y color por defecto para todos los charts
    Chart.defaults.font.family = 'system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, "Helvetica Neue", Arial';
    Chart.defaults.color = '#334155'; // slate-700

    // Plugin para mostrar mensaje cuando no hay datos tras filtros
    this.fillerTextPlugin = {
      id: 'fillerText',
      afterDraw: (chart: any) => {
        const ds = chart.data?.datasets?.[0]?.data || [];
        const total = Array.isArray(ds) ? ds.reduce((a: number, b: number) => a + (Number(b) || 0), 0) : 0;
        const noLabels = !chart.data?.labels?.length;
        if ((total === 0 && ds.length > 0) || noLabels) {
          const { ctx, chartArea } = chart;
          if (!chartArea) return;
          ctx.save();
          ctx.fillStyle = '#94a3b8';
          ctx.font = '600 14px system-ui, -apple-system, Segoe UI, Roboto';
          ctx.textAlign = 'center';
          ctx.fillText('Sin datos para los filtros actuales',
            (chartArea.left + chartArea.right) / 2,
            (chartArea.top + chartArea.bottom) / 2
          );
          ctx.restore();
        }
      }
    };
  }

  // ====== CARGA CSV ======
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
        complete: (result: { data: any[]; errors: any[]; meta: any }) => {
          try {
            const data = (result.data as any[]).map((r: any) => this.mapRow(r));
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

  // ====== LOOKUPS (incluye fechas únicas para dropdowns) ======
  private buildLookups() {
    const uniq = (arr: (string | undefined | null)[]) => [...new Set(arr.filter((x): x is string => !!x))];

    // Fechas únicas a partir de fechaReporte -> formato "yyyy-MM-dd"
    const fechas = uniq(
      this.rows
        .map(r => r.fechaReporte ? this.dateToKey(r.fechaReporte) : null)
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

  // ====== FECHAS: handler de los dropdowns ======
  onFechaSelectChange() {
    this.filters.dateStart = this.filters.fechaDesde ? this.keyToDate(this.filters.fechaDesde) : null;
    this.filters.dateEnd = this.filters.fechaHasta ? this.keyToDate(this.filters.fechaHasta) : null;
    this.applyFilters();
  }

  // ====== FILTROS ======
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

    this.computeMetrics();
    this.updateCharts();
    this.buildResumen();
  }

  private stripTime(d: Date) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  private stripTimeEnd(d: Date) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  }

  private computeMetrics() {
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    this.metrics.totalCamaras = sum(this.filtered.map(r => r.totalCamaras || 0));
    this.metrics.camarasConFalla = sum(this.filtered.map(r => r.camsConFalla || 0));

    const ratio = (s: string) => {
      const v = (s || '').toLowerCase();
      if (v === 'todas') return 1;
      if (v.includes('mas de la mitad') || v.includes('más de la mitad')) return 0.7;
      if (v.includes('menos de la mitad')) return 0.3;
      if (v === 'no') return 0;
      return 0.5;
    };
    this.metrics.operativasInterpretadas = this.filtered
      .map(r => Math.round((r.totalCamaras || 0) * ratio(r.operativasHoy || '')))
      .reduce((a, b) => a + b, 0);
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

  // ====== Utils para charts ======
  private shortLabel(label: string, max = 16): string {
    const s = (label || '').trim();
    if (s.length <= max) return s;
    const cut = s.slice(0, max).lastIndexOf(' ');
    return (cut > 8 ? s.slice(0, cut) : s.slice(0, max - 1)) + '…';
  }

  private getBaseOptions(): any {
    return {
      responsive: true,
      maintainAspectRatio: false, // usa altura de canvas del SCSS
      animation: { duration: 600, easing: 'easeOutQuart' },
      layout: { padding: { top: 6, right: 8, bottom: 6, left: 8 } },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'center',
          labels: {
            usePointStyle: true,
            pointStyle: 'rect',
            boxWidth: 10,
            boxHeight: 10,
            borderRadius: 2
          }
        },
        tooltip: { intersect: false, mode: 'index' }
      }
    };
  }

  private getBarOptions(): any {
    const base = this.getBaseOptions();
    return {
      ...base,
      plugins: { ...base.plugins, legend: { display: false } },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            autoSkip: false,
            maxRotation: 0,
            minRotation: 0,
            callback: (_: any, idx: number, ticks: any) => {
              const label = (ticks[idx]?.label ?? '').toString();
              return this.shortLabel(label, 24);
            }
          }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,0.06)' },
          ticks: { precision: 0 }
        }
      }
    };
  }

  private getDoughnutOptions(): any {
    const base = this.getBaseOptions();
    return {
      ...base,
      cutout: '62%',
      plugins: {
        ...base.plugins,
        legend: { ...base.plugins.legend, position: 'bottom', labels: { ...base.plugins.legend.labels, padding: 10 } }
      }
    };
  }

  // ====== CHARTS ======
  private destroyCharts() {
    this.charts.forEach(c => c.destroy());
    this.charts = [];
  }

  private updateCharts() {
    this.destroyCharts();

    // 1) Operativas vs Totales (Doughnut)
    const ctx1 = (document.getElementById('chartOperativas') as HTMLCanvasElement)?.getContext('2d');
    if (ctx1) {
      const total = Math.max(this.metrics.totalCamaras, 0);
      const op = Math.min(this.metrics.operativasInterpretadas, total);
      const noOp = Math.max(total - op, 0);

      this.charts.push(new Chart(ctx1, {
        type: 'doughnut',
        data: {
          labels: ['Operativas (aprox.)', 'No operativas (aprox.)'],
          datasets: [{ data: [op, noOp] }]
        },
        options: this.getDoughnutOptions(),
        plugins: [this.fillerTextPlugin]
      }));
    }

    // 2) Fallas por Tipo (top)
    const fallas: Record<string, number> = {};
    this.filtered.forEach(r => {
      const all = `${r.fallaTipo || ''};${r.fallasGenerales || ''}`
        .split(/[;,\t]/g)
        .map(x => x.trim())
        .filter(Boolean);
      all.forEach(f => fallas[f] = (fallas[f] || 0) + 1);
    });
    const sortedFallas = Object.entries(fallas).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const ctx2 = (document.getElementById('chartFallasTipo') as HTMLCanvasElement)?.getContext('2d');
    if (ctx2) {
      this.charts.push(new Chart(ctx2, {
        type: 'bar',
        data: {
          labels: sortedFallas.map(([k]) => this.shortLabel(k, 28)),
          datasets: [{
            label: 'Conteo',
            data: sortedFallas.map(([, v]) => v),
            borderWidth: 1,
            borderRadius: 6,
            barPercentage: 0.7,
            categoryPercentage: 0.7
          }]
        },
        options: this.getBarOptions(),
        plugins: [this.fillerTextPlugin]
      }));
    }

    // 3) Reportes por Ubicación
    const repUb: Record<string, number> = {};
    this.filtered.forEach(r => { repUb[r.ubicacion] = (repUb[r.ubicacion] || 0) + 1; });
    const ctx3 = (document.getElementById('chartReportesUbicacion') as HTMLCanvasElement)?.getContext('2d');
    if (ctx3) {
      const pairs = Object.entries(repUb).sort((a, b) => b[1] - a[1]).slice(0, 10);
      this.charts.push(new Chart(ctx3, {
        type: 'bar',
        data: {
          labels: pairs.map(([k]) => this.shortLabel(k, 28)),
          datasets: [{
            label: 'Reportes',
            data: pairs.map(([, v]) => v),
            borderWidth: 1,
            borderRadius: 6,
            barPercentage: 0.7,
            categoryPercentage: 0.7
          }]
        },
        options: this.getBarOptions(),
        plugins: [this.fillerTextPlugin]
      }));
    }

    // 4) Cámaras con Falla por Ubicación
    const fallaUb: Record<string, number> = {};
    this.filtered.forEach(r => { fallaUb[r.ubicacion] = (fallaUb[r.ubicacion] || 0) + (r.camsConFalla || 0); });
    const ctx4 = (document.getElementById('chartFallaUbicacion') as HTMLCanvasElement)?.getContext('2d');
    if (ctx4) {
      const pairs = Object.entries(fallaUb).sort((a, b) => b[1] - a[1]).slice(0, 10);
      this.charts.push(new Chart(ctx4, {
        type: 'bar',
        data: {
          labels: pairs.map(([k]) => this.shortLabel(k, 28)),
          datasets: [{
            label: 'Cáms con falla',
            data: pairs.map(([, v]) => v),
            borderWidth: 1,
            borderRadius: 6,
            barPercentage: 0.7,
            categoryPercentage: 0.7
          }]
        },
        options: this.getBarOptions(),
        plugins: [this.fillerTextPlugin]
      }));
    }
  }
private nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

  // ====== EXPORTAR PDF ======
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
        // 0) Marca de modo export
        clonedDoc.body.classList.add('exporting');

        // 1) Elimina todos los <link rel="stylesheet"> y TODOS los <style>
        clonedDoc.querySelectorAll('link[rel="stylesheet"]').forEach(n => n.remove());
        clonedDoc.querySelectorAll('style').forEach(n => n.remove());

        // 2) Limpia estilos inline problemáticos (oklch / color-mix / gradients)
        const BAD_PAT = /(oklch|color-mix|conic-gradient|radial-gradient|linear-gradient)/i;
        clonedDoc.querySelectorAll<HTMLElement>('*').forEach(el => {
          const inl = el.getAttribute('style') || '';
          if (BAD_PAT.test(inl)) el.removeAttribute('style');
          // Asegura fondo y variables más usadas
          (el as HTMLElement).style.setProperty('--background', '#ffffff');
          (el as HTMLElement).style.setProperty('background', '#ffffff', 'important');
        });

        // 3) Inyecta un reset plano y seguro
        const safe = clonedDoc.createElement('style');
        safe.textContent = `
          /* Reset total para evitar funciones CSS no soportadas por html2canvas */
          * {
            background: #ffffff !important;
            background-image: none !important;
            box-shadow: none !important;
            text-shadow: none !important;
            border-color: #e5e7eb !important;
            color: #111827 !important;
          }
          body, ion-content { --background: #ffffff !important; }
          #reportArea, ion-card, .kpi, .resumen p, .resumen ul, .resumen ul li, .table-responsive {
            background: #ffffff !important;
            border: 1px solid #e5e7eb !important;
          }
          .charts canvas { background: #ffffff !important; }
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
      pdf.addImage(imgData, 'PNG', margin,
        position - (pdfHeight - heightLeft), pdfWidth, pdfHeight, '', 'FAST');
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

  ngOnDestroy(): void {
    this.destroyCharts();
  }
}
