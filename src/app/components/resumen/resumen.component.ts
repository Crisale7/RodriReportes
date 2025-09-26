import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonCard, IonCardHeader, IonCardTitle, IonCardContent
} from '@ionic/angular/standalone';

export type Metrics = {
  totalCamaras: number;
  operativasInterpretadas: number;
  camarasConFalla: number;
};

@Component({
  selector: 'app-resumen',
  standalone: true,
  imports: [CommonModule, IonCard, IonCardHeader, IonCardTitle, IonCardContent],
  templateUrl: './resumen.component.html',
  styleUrls: ['./resumen.component.scss'],
})
export class ResumenComponent {
  // Texto superior
  @Input() periodo = '';

  // Filtros mostrados en chips
  @Input() ubicacion = '';
  @Input() encargado = '';
  @Input() momento = '';
  @Input() operativas = '';

  // Totales
  @Input() totalReportes = 0;
  @Input() metrics: Metrics | null = null;

  // Lista de destacados
  @Input() destacados: string[] = [];
}
