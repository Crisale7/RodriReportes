import {
  Component, OnInit, OnChanges, OnDestroy, Input, Output, EventEmitter,
  SimpleChanges, ViewChild, ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonCard, IonCardHeader, IonCardTitle, IonCardContent
} from '@ionic/angular/standalone';

import Chart from 'chart.js/auto';
import ChartDataLabels from 'chartjs-plugin-datalabels';

Chart.register(ChartDataLabels);

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
  operativasHoy: string;   // ya no se usa para cálculos (se mantiene por compatibilidad)
  camsConFalla: number;
  fallaTipo?: string;
  fallasGenerales?: string;
};

type Metrics = {
  totalCamaras: number;
  operativasInterpretadas: number; // ahora = total - conFalla (valor real, no estimado)
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

  // Todas las métricas derivadas EXCLUSIVAMENTE de datos reales
  metrics: Metrics = { totalCamaras: 0, operativasInterpretadas: 0, camarasConFalla: 0 };

  @ViewChild('chartOperativas') chartOperativasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartMomento') chartMomentoRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartReportesUbicacion') chartReportesUbicacionRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartFallaUbicacion') chartFallaUbicacionRef!: ElementRef<HTMLCanvasElement>;

  private charts: Chart[] = [];

  ngOnInit(): void {
    Chart.defaults.font.family =
      'system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, "Helvetica Neue", Arial';
    Chart.defaults.color = '#334155';
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

  // ============================
  // CÁLCULO 100% BASADO EN DATOS
  // ============================
  private computeMetrics() {
    let total = 0;
    let conFalla = 0;

    for (const r of this.filtered) {
      const t = Number(r.totalCamaras) || 0;
      const f = Number(r.camsConFalla) || 0;

      total += t;
      conFalla += Math.min(Math.max(f, 0), t); // clamp simple
    }

    const operativas = Math.max(total - conFalla, 0);

    this.metrics.totalCamaras = total;
    this.metrics.camarasConFalla = conFalla;
    this.metrics.operativasInterpretadas = operativas; // valor real (no estimado)
  }

  // ===============
  // CHARTS / GRÁFICOS
  // ===============
  private destroyCharts() {
    this.charts.forEach(c => c.destroy());
    this.charts = [];
  }

  private getBaseOptions(): any {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: true, position: 'top' },
        datalabels: { display: false }
      }
    };
  }

  private updateCharts() {
    this.destroyCharts();

    // 1) Operativas vs Totales (valores REALES)
    const c1 = this.chartOperativasRef?.nativeElement?.getContext('2d');
    if (c1) {
      const total = Math.max(this.metrics.totalCamaras, 0);
      const conFalla = Math.min(this.metrics.camarasConFalla, total);
      const operativas = Math.max(total - conFalla, 0);

      this.charts.push(new Chart(c1, {
        type: 'doughnut',
        data: {
          labels: ['Operativas', 'No operativas'],
          datasets: [{ data: [operativas, conFalla] }]
        },
        options: {
          ...this.getBaseOptions(),
          plugins: {
            legend: { position: 'bottom' },
            datalabels: {
              color: '#111827',
              font: { weight: 'bold' },
              formatter: (value: number, ctx: any) => {
                const dataArr = ctx.chart.data.datasets[0].data as number[];
                const sum = dataArr.reduce((a, b) => a + (Number(b) || 0), 0);
                return sum ? ((value / sum) * 100).toFixed(1) + '%' : '0%';
              }
            }
          }
        }
      }));
    }

    // 2) Distribución por Momento (conteo real de reportes)
    const repMomento: Record<string, number> = {};
    this.filtered.forEach(r => {
      repMomento[r.momento] = (repMomento[r.momento] || 0) + 1;
    });

    const c2 = this.chartMomentoRef?.nativeElement?.getContext('2d');
    if (c2) {
      this.charts.push(new Chart(c2, {
        type: 'pie',
        data: {
          labels: Object.keys(repMomento),
          datasets: [{ data: Object.values(repMomento) }]
        },
        options: {
          ...this.getBaseOptions(),
          plugins: {
            legend: { position: 'bottom' },
            datalabels: {
              color: '#111827',
              font: { weight: 'bold' },
              formatter: (value: number, ctx: any) => {
                const dataArr = ctx.chart.data.datasets[0].data as number[];
                const sum = dataArr.reduce((a, b) => a + (Number(b) || 0), 0);
                return sum ? ((value / sum) * 100).toFixed(1) + '%' : '0%';
              }
            }
          }
        }
      }));
    }

    // 3) Reportes por Ubicación (conteo real)
    const repUb: Record<string, number> = {};
    this.filtered.forEach(r => { repUb[r.ubicacion] = (repUb[r.ubicacion] || 0) + 1; });
    const pairsRepUb = Object.entries(repUb).sort((a, b) => b[1] - a[1]).slice(0, 10);

    const c3 = this.chartReportesUbicacionRef?.nativeElement?.getContext('2d');
    if (c3) {
      this.charts.push(new Chart(c3, {
        type: 'bar',
        data: {
          labels: pairsRepUb.map(([k]) => k),
          datasets: [{ label: 'Reportes', data: pairsRepUb.map(([, v]) => v) }]
        },
        options: this.getBaseOptions()
      }));
    }

    // 4) Cámaras con Falla por Ubicación (suma real de `camsConFalla`)
    const fallaUb: Record<string, number> = {};
    this.filtered.forEach(r => {
      const f = Number(r.camsConFalla) || 0;
      fallaUb[r.ubicacion] = (fallaUb[r.ubicacion] || 0) + f;
    });
    const pairsFallaUb = Object.entries(fallaUb).sort((a, b) => b[1] - a[1]).slice(0, 10);

    const c4 = this.chartFallaUbicacionRef?.nativeElement?.getContext('2d');
    if (c4) {
      this.charts.push(new Chart(c4, {
        type: 'bar',
        data: {
          labels: pairsFallaUb.map(([k]) => k),
          datasets: [{ label: 'Cáms con falla', data: pairsFallaUb.map(([, v]) => v) }]
        },
        options: this.getBaseOptions()
      }));
    }
  }
}
