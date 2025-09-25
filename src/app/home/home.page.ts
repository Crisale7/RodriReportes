import { Component, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonIcon,
  IonGrid, IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonCardSubtitle,
  IonItem, IonLabel, IonSelect, IonSelectOption, IonText, IonAccordion, IonAccordionGroup, IonNote, IonList
} from '@ionic/angular/standalone';

import { NgApexchartsModule } from 'ng-apexcharts';
import type {
  ApexAxisChartSeries, ApexChart, ApexXAxis, ApexPlotOptions, ApexDataLabels, ApexTooltip, ApexYAxis,
  ApexNonAxisChartSeries, ApexLegend, ApexFill, ApexStroke, ApexGrid
} from 'ng-apexcharts';

import Papa from 'papaparse';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// —— Normaliza encabezados (quita NBSP y espacios múltiples) —— //
const norm = (s: string) => (s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

// —— Encabezados del CSV "oficial" —— //
const COL = {
  id: 'Id',
  inicio: 'Hora de inicio',
  fin: 'Hora de finalización',
  email: 'Correo electrónico',
  nombre: 'Nombre',
  ubicacion: 'Ubicación',
  encargadoAlt: 'Nombre del Encargado1',
  fecha: 'Fecha del Reporte',
  totalAlt: '¿Cuántas cámaras en total están instaladas en la Ubicación?1',
  operativasCat: '¿Cuántas cámaras están operativas hoy?1',
  momento: 'Momento de Verificación de Cámaras',
  fallosReportados: 'Indicar fallo y el tipo de fallo en las cámaras, de lo contrario ingresa "Sin Observaciones"',
  fallosReportadosNBSP: 'Indicar\u00a0 fallo y el tipo de fallo en las cámaras, de lo contrario ingresa "Sin Observaciones"',
  camarasConFalla: 'Detalla qué cámaras son las que presentan fallas, ubicación, nombre, modelo.',
  fallaTecnica1: '¿Se detectaron fallas técnicas generales en el sistema?\u00a0\u00a01',
  fallaTecnicaNB: '¿Se detectaron fallas técnicas generales en el sistema?\u00a0\u00a0',
  malaCalidad: '¿Se detectaron cámaras con mala calidad de imagen, obstruidas o con interferencias?',
  nFallasImagen: 'Indicar el número de cámaras que se encuentran con el fallo, de lo contrario ingresa "0"',
  detalleFallo: 'Indicar la Serie de las cámaras con fallo y el tipo de fallo en cada una , de lo contrario ingresa "Sin Observaciones"',
  adjuntos: 'Adjuntar Imágenes o Documentos del Fallo y/o Observaciones',
  cortes: '¿Hubo cortes de energía o fallos en la red o sistema?',
  observaciones: 'Observaciones que Pudiste Encontrar acerca del Monitoreo',
  observaciones1: 'Observaciones que Pudiste Encontrar acerca del Monitoreo1',
  recomendaciones: '¿Alguna recomendación o sugerencia?\u00a0\u00a0',
} as const;

export type Row = {
  id?: string; fecha: Date; ubicacion: string; nombre?: string; encargado?: string; momento?: string;
  total: number; operativas: number; noOperativas: number;
  operativasCat?: string;
  fallasImagen: number; malaCalidad?: string;
  fallosReportados?: string; camarasConFalla?: string; detalleFallo?: string;
  fallaTecnica?: string; cortes?: string; observaciones?: string; recomendaciones?: string;
  adjuntos?: string;
};

@Component({
  selector: 'app-home',
  standalone: true,
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonIcon,
    IonGrid, IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonCardSubtitle,
    IonItem, IonLabel, IonSelect, IonSelectOption, IonText, IonAccordion, IonAccordionGroup, IonNote, IonList,
    NgApexchartsModule,
  ],
})
export class HomePage {
  // Datos
  records: Row[] = [];
  filtered: Row[] = [];

  // Filtros
  allUbicaciones: string[] = [];
  allMomentos: string[] = [];
  allFechas: string[] = [];        // todas las fechas disponibles (YYYY-MM-DD)
  fechasDesde: string[] = [];      // lista para el select "Desde"
  fechasHasta: string[] = [];      // lista para el select "Hasta"

  filters = {
    ubicaciones: [] as string[],
    desde: '', // YYYY-MM-DD
    hasta: '', // YYYY-MM-DD
    momento: '' as string | '',
  };

  // UI estado
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  isDragging = false;

  // KPIs
  kpis: { label: string; value: string; sub?: string }[] = [];

  // Charts (Apex) — no opcionales en inputs
  chartBar: {
    series: ApexAxisChartSeries; chart: ApexChart; xaxis: ApexXAxis; plotOptions: ApexPlotOptions;
    dataLabels: ApexDataLabels; tooltip: ApexTooltip; yaxis: ApexYAxis; grid: ApexGrid; colors: any[]; fill: ApexFill; stroke: ApexStroke;
  } = {
    series: [],
    chart: { type: 'bar', height: 340, toolbar: { show: false }, animations: { enabled: true, speed: 500 } },
    xaxis: { categories: [], labels: { style: { fontSize: '12px' } } },
    yaxis: { min: 0, labels: { style: { fontSize: '12px' } } },
    plotOptions: { bar: { horizontal: false, columnWidth: '45%', borderRadius: 6 } },
    dataLabels: { enabled: false },
    tooltip: { shared: true },
    grid: { strokeDashArray: 4 },
    colors: ['var(--ion-color-success)', 'var(--ion-color-primary)'],
    fill: {
      type: 'gradient',
      gradient: { shade: 'light', type: 'vertical', shadeIntensity: 0.2, opacityFrom: 0.95, opacityTo: 0.85, stops: [0, 100] }
    },
    stroke: { width: 2 }
  };

  chartPie: {
    series: ApexNonAxisChartSeries; chart: ApexChart; labels: string[]; legend: ApexLegend; dataLabels: ApexDataLabels; plotOptions: ApexPlotOptions; colors: any[];
  } = {
    series: [],
    chart: { type: 'donut', height: 320 },
    labels: [],
    legend: { position: 'bottom' },
    dataLabels: { enabled: true, style: { fontSize: '14px', fontWeight: '600' } },
    colors: ['var(--ion-color-success)', 'var(--ion-color-danger)'],
    plotOptions: {
      pie: { donut: { size: '70%', labels: { show: true, total: { show: true, label: 'Total' } } } }
    }
  };

  // ————— Carga CSV ————— //
  browseFiles() { this.fileInput?.nativeElement?.click(); }
  onDragOver(e: DragEvent) { e.preventDefault(); this.isDragging = true; }
  onDragLeave(e: DragEvent) { e.preventDefault(); this.isDragging = false; }
  onDrop(e: DragEvent) {
    e.preventDefault(); this.isDragging = false;
    const file = e.dataTransfer?.files?.[0];
    if (file && file.name.toLowerCase().endsWith('.csv')) this.parseCsvFile(file);
  }

  onFileSelected(ev: Event) {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (file) this.parseCsvFile(file);
  }

  parseCsvFile(file: File) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: 'latin1',
      complete: (res: any) => {
        const raw = res.data as any[];
        this.records = raw.map((row) => this.mapRow(row)).filter(r => !!r) as Row[];
        this.records.sort((a, b) => +a.fecha - +b.fecha); // primero ascendente para fechas únicas correctas
        this.setupFilters();
        this.applyFilters();
      },
      error: (err: unknown) => {
        console.error(err);
        alert('No se pudo leer el CSV. Verifica el archivo.');
      }
    });
  }

  // ————— Helpers CSV ————— //
  private getVal(row: any, ...keys: string[]) {
    for (const key of keys) {
      const found = Object.keys(row).find(h => norm(h) === norm(key));
      if (found) return row[found];
    }
    return undefined;
  }

  // Maneja ISO, dd/mm/yyyy, dd-mm-yyyy
  private parseDateAny(x: any): Date | undefined {
    if (!x) return undefined;
    const s = String(x).trim();

    const dIso = new Date(s);
    if (!isNaN(+dIso)) return dIso;

    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      const dd = +m[1], mm = +m[2], yyyy = +((m[3].length === 2) ? ('20' + m[3]) : m[3]);
      // UTC para evitar desfaces por tz
      return new Date(Date.UTC(yyyy, mm - 1, dd));
    }
    return undefined;
  }

  // Números con miles/decimales mixtos
  private toNum(x: any): number {
    const s = String(x ?? '').replace(/\u00a0/g, ' ').trim();
    if (!s) return 0;
    let t = s.replace(/[^0-9,.\-]/g, '');

    if (t.includes(',') && t.includes('.')) {
      const lastComma = t.lastIndexOf(',');
      const lastDot = t.lastIndexOf('.');
      if (lastComma > lastDot) {
        t = t.replace(/\./g, '').replace(',', '.');
      } else {
        t = t.replace(/,/g, '');
      }
    } else if (t.includes(',')) {
      t = t.replace(/\./g, '').replace(',', '.');
    }
    const n = Number(t);
    return isNaN(n) ? 0 : n;
  }

  private estimateOperativas(cat: string | number | undefined, total: number): number {
    const n = Number(cat);
    if (!isNaN(n) && isFinite(n)) return Math.min(Math.max(0, Math.round(n)), total);

    const s = String(cat || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const m = s.match(/(\d{1,3})\s*%/);
    if (m) {
      const p = Math.max(0, Math.min(100, Number(m[1])));
      return Math.round((p / 100) * total);
    }

    const includes = (k: string) => s.includes(k);
    let ratio = 0.5;
    if (includes('toda')) ratio = 1.0;
    else if (includes('ningun')) ratio = 0.0;
    else if (includes('mas de la mitad') || (includes('mitad') && includes('mas'))) ratio = 0.75;
    else if (includes('menos de la mitad') || (includes('mitad') && includes('menos'))) ratio = 0.25;
    else if (includes('casi toda')) ratio = 0.9;
    else if (includes('casi ningun')) ratio = 0.1;

    return Math.round(total * ratio);
  }

  private mapRow(row: any): Row | null {
    const fechaRaw = this.getVal(row, COL.fecha);
    const fecha = this.parseDateAny(fechaRaw);

    const ubicacion = (String(this.getVal(row, COL.ubicacion) ?? '')).replace(/\u00a0/g,' ').trim();
    const total = this.toNum(this.getVal(row, COL.totalAlt));

    if (!fecha || !ubicacion) return null;

    const operCat = this.getVal(row, COL.operativasCat);
    const oper = this.estimateOperativas(operCat, total);
    const noOp = Math.max(0, total - oper);

    const observ = String(this.getVal(row, COL.observaciones) ?? this.getVal(row, COL.observaciones1) ?? '');
    const fallaTec = String(this.getVal(row, COL.fallaTecnica1) ?? this.getVal(row, COL.fallaTecnicaNB) ?? '');
    const fallosTxt = String(this.getVal(row, COL.fallosReportados) ?? this.getVal(row, COL.fallosReportadosNBSP) ?? '');

    return {
      id: String(this.getVal(row, COL.id) ?? ''),
      fecha,
      ubicacion,
      nombre: String(this.getVal(row, COL.nombre) ?? ''),
      encargado: String(this.getVal(row, COL.encargadoAlt) ?? ''),
      momento: String(this.getVal(row, COL.momento) ?? ''),

      total,
      operativas: oper,
      noOperativas: noOp,
      operativasCat: String(operCat ?? ''),

      malaCalidad: String(this.getVal(row, COL.malaCalidad) ?? ''),
      fallasImagen: this.toNum(this.getVal(row, COL.nFallasImagen) ?? 0),

      fallosReportados: fallosTxt,
      camarasConFalla: String(this.getVal(row, COL.camarasConFalla) ?? ''),
      detalleFallo: String(this.getVal(row, COL.detalleFallo) ?? ''),

      fallaTecnica: fallaTec,
      cortes: String(this.getVal(row, COL.cortes) ?? ''),
      observaciones: observ,
      recomendaciones: String(this.getVal(row, COL.recomendaciones) ?? ''),
      adjuntos: String(this.getVal(row, COL.adjuntos) ?? ''),
    };
  }

  // ————— Filtros & fechas disponibles ————— //
  setupFilters() {
    this.allUbicaciones = Array.from(new Set(this.records.map(r => r.ubicacion))).sort();
    this.allMomentos = Array.from(new Set(this.records.map(r => r.momento).filter(Boolean) as string[])).sort();

    // Fechas únicas disponibles (YYYY-MM-DD)
    const fechasSet = new Set<string>(this.records.map(r => this.toISODate(r.fecha)));
    this.allFechas = Array.from(fechasSet).sort(); // ascendente

    this.filters.desde = this.allFechas[0] ?? '';
    this.filters.hasta = this.allFechas[this.allFechas.length - 1] ?? '';

    this.fechasDesde = [...this.allFechas];
    this.updateFechasHasta();
  }

  private updateFechasHasta() {
    this.fechasHasta = this.allFechas.filter(d => d >= this.filters.desde);
    if (!this.fechasHasta.includes(this.filters.hasta)) {
      this.filters.hasta = this.fechasHasta[this.fechasHasta.length - 1] ?? this.filters.desde;
    }
  }

  onDesdeSelect(ev: CustomEvent) {
    this.filters.desde = (ev.detail as any).value;
    this.updateFechasHasta();
    this.applyFilters();
  }
  onHastaSelect(ev: CustomEvent) {
    this.filters.hasta = (ev.detail as any).value;
    if (this.filters.hasta < this.filters.desde) this.filters.hasta = this.filters.desde;
    this.applyFilters();
  }

  applyFilters() {
    const { ubicaciones, momento, desde, hasta } = this.filters;
    const d0 = desde ? new Date(desde) : undefined;
    const d1 = hasta ? new Date(hasta + 'T23:59:59') : undefined;

    this.filtered = this.records.filter(r => {
      const okU = !ubicaciones?.length || ubicaciones.includes(r.ubicacion);
      const okM = !momento || r.momento === momento;
      const okD = (!d0 || r.fecha >= d0) && (!d1 || r.fecha <= d1);
      return okU && okM && okD;
    });

    this.computeKPIs();
    this.updateCharts();
  }

  private toISODate(d: Date) {
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return z.toISOString().slice(0, 10);
  }

  // ————— KPIs ————— //
  private computeKPIs() {
    const total = this.filtered.reduce((s, r) => s + r.total, 0);
    const oper = this.filtered.reduce((s, r) => s + r.operativas, 0);
    const noOp = Math.max(0, total - oper);
    const uptime = total ? (oper / total) * 100 : 0;

    const yes = (v: any) => ['sí', 'si'].includes(String(v).toLowerCase());
    const fallasImg = this.filtered.reduce((s, r) => s + (r.fallasImagen || 0), 0);
    const fallasTec = this.filtered.filter(r => yes(r.fallaTecnica) || (!!r.fallaTecnica && !/^no\b/i.test(r.fallaTecnica))).length;
    const cortes = this.filtered.filter(r => yes(r.cortes)).length;
    const mala = this.filtered.filter(r => yes(r.malaCalidad)).length;

    this.kpis = [
      { label: 'Cámaras totales', value: String(total) },
      { label: 'Operativas (est.)', value: String(oper) },
      { label: 'Uptime (est.)', value: uptime.toFixed(1) + '%' },
      { label: 'No operativas (est.)', value: String(noOp), sub: `Fallas img: ${fallasImg} · Técnicas: ${fallasTec} · Cortes: ${cortes} · Mala calidad: ${mala}` },
    ];
  }

  // ————— Charts ————— //
  private updateCharts() {
    const byU = new Map<string, { total: number; oper: number }>();
    for (const r of this.filtered) {
      const k = r.ubicacion;
      const acc = byU.get(k) || { total: 0, oper: 0 };
      acc.total += r.total; acc.oper += r.operativas; byU.set(k, acc);
    }
    const cats = Array.from(byU.keys());
    const totals = cats.map(c => byU.get(c)!.total);
    const opers  = cats.map(c => byU.get(c)!.oper);

    this.chartBar = {
      ...this.chartBar,
      xaxis: { categories: cats, labels: { style: { fontSize: '12px' } } },
      series: [
        { name: 'Operativas (est.)', data: opers },
        { name: 'Total', data: totals },
      ],
    };

    const sumTot = totals.reduce((a,b)=>a+b,0);
    const sumOp  = opers.reduce((a,b)=>a+b,0);
    const sumNo  = Math.max(0, sumTot - sumOp);
    this.chartPie = {
      ...this.chartPie,
      series: [sumOp, sumNo],
      labels: ['Operativas', 'No operativas'],
      plotOptions: {
        pie: {
          donut: {
            size: '70%',
            labels: { show: true, total: { show: true, label: 'Total', formatter: () => String(sumTot) } }
          }
        }
      }
    };

    // Debug opcional:
    // console.log('[updateCharts] filtered:', this.filtered.length, 'cats:', cats, 'totals:', totals, 'opers:', opers);
  }

  // ————— PDF ————— //
  async exportToPDF() {
    const el = document.getElementById('reportContainer');
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 2 });
    const imgData = canvas.toDataURL('image/png');

    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const imgWidth = pageWidth - 20;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let y = 10;
    pdf.text('Reporte de Monitoreo de Cámaras', 10, y);
    y += 6;

    if (imgHeight < pageHeight - y) {
      pdf.addImage(imgData, 'PNG', 10, y, imgWidth, imgHeight);
    } else {
      let sY = 0;
      const pageCanvasHeight = ((pageHeight - y) * canvas.width) / imgWidth;
      while (sY < canvas.height) {
        const page = document.createElement('canvas');
        page.width = canvas.width;
        page.height = Math.min(pageCanvasHeight, canvas.height - sY);
        const ctx = page.getContext('2d')!;
        ctx.drawImage(canvas, 0, sY, canvas.width, page.height, 0, 0, page.width, page.height);
        const pageImg = page.toDataURL('image/png');
        pdf.addImage(pageImg, 'PNG', 10, y, imgWidth, (page.height * imgWidth) / page.width);
        sY += page.height;
        if (sY < canvas.height) { pdf.addPage(); y = 10; }
      }
    }

    pdf.save('reporte-camaras.pdf');
  }
}
