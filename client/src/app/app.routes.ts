import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';
import { LoginComponent } from './login/login.component';
import { WelcomeComponent } from './welcome/welcome.component';
import { ZapEditorComponent } from './zaps/zap-editor/zap-editor.component';
import { ZapListComponent } from './zaps/zap-list/zap-list.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', component: LoginComponent },
  { path: 'welcome', component: WelcomeComponent, canActivate: [authGuard] },
  { path: 'zaps', component: ZapListComponent, canActivate: [authGuard] },
  {
    path: 'zaps/new',
    component: ZapEditorComponent,
    canActivate: [authGuard],
  },
  {
    path: 'zaps/:id',
    component: ZapEditorComponent,
    canActivate: [authGuard],
  },
  { path: '**', redirectTo: 'login' },
];
