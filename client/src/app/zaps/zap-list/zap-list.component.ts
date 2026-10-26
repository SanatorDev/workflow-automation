import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Zap, ZapService } from '../zap.service';

@Component({
  selector: 'app-zap-list',
  imports: [RouterLink],
  templateUrl: './zap-list.component.html',
  styleUrl: './zap-list.component.css',
})
export class ZapListComponent implements OnInit {
  private readonly zapsApi = inject(ZapService);

  readonly zaps = signal<Zap[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly deletingId = signal<string | null>(null);

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(null);

    this.zapsApi.list().subscribe({
      next: (zaps) => {
        this.zaps.set(zaps);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Could not load your Zaps.');
      },
    });
  }

  deleteZap(zap: Zap, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    if (!confirm(`Delete “${zap.name}”?`)) {
      return;
    }

    this.error.set(null);
    this.deletingId.set(zap.id);
    this.zapsApi.delete(zap.id).subscribe({
      next: () => {
        this.zaps.update((list) => list.filter((z) => z.id !== zap.id));
        this.deletingId.set(null);
      },
      error: () => {
        this.deletingId.set(null);
        this.error.set('Could not delete that Zap.');
      },
    });
  }
}
