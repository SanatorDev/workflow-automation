import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-login',
  imports: [],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  readonly error = this.auth.messageForLoginError(
    this.route.snapshot.queryParamMap.get('error')
  );

  login(): void {
    this.auth.loginWithGitHub();
  }
}
