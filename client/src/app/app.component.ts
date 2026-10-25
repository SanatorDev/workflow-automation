import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';

interface HealthResponse {
  mongo: string;
  message: string;
}

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  private readonly http = inject(HttpClient);

  readonly title = 'Take-Home Exercise: Workflow Automation';
  readonly mongoStatus = signal('Checking MongoDB connection...');

  ngOnInit(): void {
    this.http.get<HealthResponse>('/api/health').subscribe({
      next: (res) => this.mongoStatus.set(res.message),
      error: (err: HttpErrorResponse) => {
        const body = err.error as HealthResponse | undefined;
        if (body?.message) {
          this.mongoStatus.set(body.message);
          return;
        }

        this.mongoStatus.set(
          'Unable to reach the API. Is the Express server running?'
        );
      },
    });
  }
}
