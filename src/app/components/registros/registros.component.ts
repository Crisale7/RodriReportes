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
  detalleFallas?: string;   // 👈 ya incluido
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

  splitDetalle(texto: string): string[] {
  if (!texto) return [];

  // Normalizamos separadores: saltos de línea, punto y coma o simplemente "Cámara:"
  return texto
    .split(/Cámara:/i)              // partimos por la palabra "Cámara:"
    .map(t => t.trim())             // limpiamos espacios
    .filter(t => t.length > 0)      // eliminamos vacíos
    .map(t => `Cámara: ${t}`);      // le volvemos a poner el prefijo
}
}
