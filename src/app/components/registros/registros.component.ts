import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonCard, IonCardHeader, IonCardTitle, IonCardContent
} from '@ionic/angular/standalone';

export type Registro = {
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
  selector: 'app-registros',
  templateUrl: './registros.component.html',
  styleUrls: ['./registros.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent
  ]
})
export class RegistrosComponent {
  @Input() filtered: Registro[] = [];
}
