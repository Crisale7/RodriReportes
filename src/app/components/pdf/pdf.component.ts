import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonButton, IonIcon } from '@ionic/angular/standalone';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

@Component({
  selector: 'app-pdf',
  standalone: true,
  imports: [CommonModule, IonButton, IonIcon],
  templateUrl: './pdf.component.html',
  styleUrls: ['./pdf.component.scss']
})
export class PdfComponent {
  @Input() targetId = 'reportArea';   // ID del contenedor a exportar
  @Input() ubicacion = 'Todas';       // usado en nombre del archivo
  @Input() disabled = false;

  private safeBreaksCss: number[] = [];

  private nextFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  /** === EXPORTAR IMAGEN === */
  async exportImage(format: 'png' | 'jpeg' = 'png', quality = 0.92) {
    const element = document.getElementById(this.targetId);
    if (!element) return;

    try {
      await this.nextFrame();

      const canvas = await html2canvas(element, {
        scale: window.devicePixelRatio || 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      });

      const mime = format === 'png' ? 'image/png' : 'image/jpeg';
      const dataUrl = canvas.toDataURL(mime, quality);

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
    const ext = format === 'png' ? 'png' : 'jpg';
    return `Reporte_Camaras_${this.ubicacion}_${fecha}.${ext}`;
  }

  /** === EXPORTAR PDF === */
  async exportPDF() {
    const container = document.getElementById(this.targetId);
    if (!container) return;

    try {
      await this.nextFrame();

      let clonedContainerWidth = 0;

      const canvas = await html2canvas(container, {
        scale: window.devicePixelRatio || 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        windowWidth: container.scrollWidth,
        onclone: (clonedDoc) => {
          // Limpieza avanzada de estilos
          clonedDoc.body.classList.add('exporting');
          clonedDoc.querySelectorAll('link[rel="stylesheet"]').forEach(n => n.remove());
          clonedDoc.querySelectorAll('style').forEach(n => n.remove());

          const BAD_PAT = /(oklch|color-mix|conic-gradient|radial-gradient|linear-gradient)/i;
          clonedDoc.querySelectorAll<HTMLElement>('*').forEach(el => {
            const inl = el.getAttribute('style') || '';
            if (BAD_PAT.test(inl)) el.removeAttribute('style');
            el.style.setProperty('--background', '#ffffff');
            el.style.setProperty('background', '#ffffff', 'important');
          });

          const safe = clonedDoc.createElement('style');
          safe.textContent = `
            * {
              background:#fff !important; background-image:none !important;
              box-shadow:none !important; text-shadow:none !important;
              border-color:#e5e7eb !important; color:#111827 !important;
            }
            body, ion-content { --background:#fff !important; }
            #reportArea, ion-card {
              background:#fff !important; border:1px solid #e5e7eb !important;
            }
            .no-split {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
          `;
          clonedDoc.head.appendChild(safe);

          // === Calcular cortes seguros SOLO en .no-split ===
          const clonedContainer = clonedDoc.getElementById(this.targetId) as HTMLElement | null;
          this.safeBreaksCss = [];
          if (clonedContainer) {
            clonedContainerWidth = clonedContainer.clientWidth;
            const containerRect = clonedContainer.getBoundingClientRect();
            const getBottom = (el: Element) => {
              const r = (el as HTMLElement).getBoundingClientRect();
              return (r.bottom - containerRect.top);
            };

            const candidates = Array
              .from(clonedContainer.querySelectorAll('.no-split'))
              .map(getBottom)
              .filter(y => y > 0)
              .sort((a, b) => a - b);

            const MIN_GAP = 24;
            for (const y of candidates) {
              if (!this.safeBreaksCss.length ||
                  Math.abs(y - this.safeBreaksCss[this.safeBreaksCss.length - 1]) > MIN_GAP) {
                this.safeBreaksCss.push(Math.round(y));
              }
            }
          }
        },
      });

      const scaleFactor = clonedContainerWidth ? (canvas.width / clonedContainerWidth) : 1;
      const uniqueBreaks = this.safeBreaksCss.map(y => Math.round(y * scaleFactor));

      const autoOrientation: 'p' | 'l' = canvas.width >= canvas.height ? 'l' : 'p';
      const pdf = new jsPDF({ orientation: autoOrientation, unit: 'mm', format: 'a4' });

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const marginMM = 20;
      const usableWmm = pageW - marginMM * 2;
      const imgWmm = usableWmm;
      const imgHmm = (canvas.height * imgWmm) / canvas.width;

      const pxPerMM = canvas.height / imgHmm;
      const usableHPx = (pageH - marginMM * 2) * pxPerMM;

      // === Nuevo slicing ===
      const slices: Array<{ y: number; h: number; }> = [];
      let y = 0;
      const SAFE_PADDING = 20;
      const MIN_SLICE = 240;

      while (y < canvas.height) {
        const target = y + usableHPx;
        const candidatesInWindow = uniqueBreaks.filter(b => b <= target && b >= y + MIN_SLICE);

        let end = candidatesInWindow.length
          ? candidatesInWindow[candidatesInWindow.length - 1] - SAFE_PADDING
          : target;

        if (end > canvas.height) end = canvas.height;
        if (end <= y) end = Math.min(canvas.height, y + usableHPx);

        const height = Math.round((end - y) / 8) * 8;
        slices.push({ y, h: height });
        y = end;
      }

      // === Pintar slices en el PDF ===
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
    return `Reporte_Camaras_${this.ubicacion}_${fecha}.pdf`;
  }
}
