import {
  Component, OnInit, OnChanges, OnDestroy, Input, Output, EventEmitter,
  SimpleChanges, ViewChild, ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';

// Ionic standalone components que se usan en el HTML
import {
  IonCard, IonCardHeader, IonCardTitle, IonCardContent
} from '@ionic/angular/standalone';

import Chart from 'chart.js/auto';

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
  selector: 'app-metricas',
  standalone: true,
  imports: [CommonModule, IonCard, IonCardHeader, IonCardTitle, IonCardContent],
  templateUrl: './metricas.component.html',
  styleUrls: ['./metricas.component.scss'],
})
export class MetricasComponent implements OnInit, OnChanges, OnDestroy {
  @Input() filtered: Registro[] = [];
  @Output() metricsChange = new EventEmitter<Metrics>();

  metrics: Metrics = {
    totalCamaras: 0,
    operativasInterpretadas: 0,
    camarasConFalla: 0
  };

  @ViewChild('chartOperativas', { static: false }) chartOperativasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartFallasTipo', { static: false }) chartFallasTipoRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartReportesUbicacion', { static: false }) chartReportesUbicacionRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartFallaUbicacion', { static: false }) chartFallaUbicacionRef!: ElementRef<HTMLCanvasElement>;

  private charts: Chart[] = [];
  private fillerTextPlugin: any;

  ngOnInit(): void {
    Chart.defaults.font.family =
      'system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, "Helvetica Neue", Arial';
    Chart.defaults.color = '#334155';

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
          ctx.fillText(
            'Sin datos para los filtros actuales',
            (chartArea.left + chartArea.right) / 2,
            (chartArea.top + chartArea.bottom) / 2
          );
          ctx.restore();
        }
      }
    };
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['filtered']) {
      this.computeMetrics();
      this.metricsChange.emit(this.metrics);
      queueMicrotask(() => this.updateCharts());
    }
  }

  ngOnDestroy(): void {
    this.destroyCharts();
  }

  private computeMetrics() {
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    const ratio = (s: string) => {
      const v = (s || '').toLowerCase();
      if (v === 'todas') return 1;
      if (v.includes('mas de la mitad') || v.includes('más de la mitad')) return 0.7;
      if (v.includes('menos de la mitad')) return 0.3;
      if (v === 'no') return 0;
      return 0.5;
    };

    const totales = this.filtered.map(r => r.totalCamaras || 0);
    const conFalla = this.filtered.map(r => r.camsConFalla || 0);
    const operAprox = this.filtered.map(r => Math.round((r.totalCamaras || 0) * ratio(r.operativasHoy || '')));

    this.metrics.totalCamaras = sum(totales);
    this.metrics.camarasConFalla = sum(conFalla);
    this.metrics.operativasInterpretadas = sum(operAprox);
  }

  private destroyCharts() {
    this.charts.forEach(c => c.destroy());
    this.charts = [];
  }

  private shortLabel(label: string, max = 16): string {
    const s = (label || '').trim();
    if (s.length <= max) return s;
    const cut = s.slice(0, max).lastIndexOf(' ');
    return (cut > 8 ? s.slice(0, cut) : s.slice(0, max - 1)) + '…';
  }

  private getBaseOptions(): any {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeOutQuart' },
      layout: { padding: { top: 6, right: 8, bottom: 6, left: 8 } },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'center',
          labels: { usePointStyle: true, pointStyle: 'rect', boxWidth: 10, boxHeight: 10, borderRadius: 2 }
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
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { precision: 0 } }
      }
    };
  }

  private getDoughnutOptions(): any {
    const base = this.getBaseOptions();
    return {
      ...base,
      cutout: '62%',
      plugins: { ...base.plugins, legend: { ...base.plugins.legend, position: 'bottom', labels: { ...base.plugins.legend.labels, padding: 10 } } }
    };
  }

  private updateCharts() {
    this.destroyCharts();

    // 1) Operativas vs Totales
    const c1 = this.chartOperativasRef?.nativeElement?.getContext('2d');
    if (c1) {
      const total = Math.max(this.metrics.totalCamaras, 0);
      const op = Math.min(this.metrics.operativasInterpretadas, total);
      const noOp = Math.max(total - op, 0);
      this.charts.push(new Chart(c1, {
        type: 'doughnut',
        data: { labels: ['Operativas (aprox.)', 'No operativas (aprox.)'], datasets: [{ data: [op, noOp] }] },
        options: this.getDoughnutOptions(),
        plugins: [this.fillerTextPlugin]
      }));
    }

    // 2) Fallas por Tipo (top)
    const fallas: Record<string, number> = {};
    this.filtered.forEach(r => {
      const all = `${r.fallaTipo || ''};${r.fallasGenerales || ''}`.split(/[;,\t]/g).map(x => x.trim()).filter(Boolean);
      all.forEach(f => fallas[f] = (fallas[f] || 0) + 1);
    });
    const sortedFallas = Object.entries(fallas).sort((a, b) => b[1] - a[1]).slice(0, 8);

    const c2 = this.chartFallasTipoRef?.nativeElement?.getContext('2d');
    if (c2) {
      this.charts.push(new Chart(c2, {
        type: 'bar',
        data: {
          labels: sortedFallas.map(([k]) => this.shortLabel(k, 28)),
          datasets: [{ label: 'Conteo', data: sortedFallas.map(([, v]) => v), borderWidth: 1, borderRadius: 6, barPercentage: 0.7, categoryPercentage: 0.7 }]
        },
        options: this.getBarOptions(),
        plugins: [this.fillerTextPlugin]
      }));
    }

    // 3) Reportes por Ubicación
    const repUb: Record<string, number> = {};
    this.filtered.forEach(r => { repUb[r.ubicacion] = (repUb[r.ubicacion] || 0) + 1; });
    const pairsRepUb = Object.entries(repUb).sort((a, b) => b[1] - a[1]).slice(0, 10);

    const c3 = this.chartReportesUbicacionRef?.nativeElement?.getContext('2d');
    if (c3) {
      this.charts.push(new Chart(c3, {
        type: 'bar',
        data: {
          labels: pairsRepUb.map(([k]) => this.shortLabel(k, 28)),
          datasets: [{ label: 'Reportes', data: pairsRepUb.map(([, v]) => v), borderWidth: 1, borderRadius: 6, barPercentage: 0.7, categoryPercentage: 0.7 }]
        },
        options: this.getBarOptions(),
        plugins: [this.fillerTextPlugin]
      }));
    }

    // 4) Cámaras con Falla por Ubicación
    const fallaUb: Record<string, number> = {};
    this.filtered.forEach(r => { fallaUb[r.ubicacion] = (fallaUb[r.ubicacion] || 0) + (r.camsConFalla || 0); });
    const pairsFallaUb = Object.entries(fallaUb).sort((a, b) => b[1] - a[1]).slice(0, 10);

    const c4 = this.chartFallaUbicacionRef?.nativeElement?.getContext('2d');
    if (c4) {
      this.charts.push(new Chart(c4, {
        type: 'bar',
        data: {
          labels: pairsFallaUb.map(([k]) => this.shortLabel(k, 28)),
          datasets: [{ label: 'Cáms con falla', data: pairsFallaUb.map(([, v]) => v), borderWidth: 1, borderRadius: 6, barPercentage: 0.7, categoryPercentage: 0.7 }]
        },
        options: this.getBarOptions(),
        plugins: [this.fillerTextPlugin]
      }));
    }
  }
}
