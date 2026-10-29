import { Component, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GitHubRepo, GitHubService } from '../../github.service';
import {
  ACTION_EVENTS_BY_APP,
  BODY_FIELD_MAPPINGS,
  DEVELOPER_APPS,
  TRIGGER_EVENTS_BY_APP,
  appIsWired,
  bodyFieldToken,
  bodyTokensInMessage,
  eventsForApp,
  isGitHubApp,
} from '../zap-apps';
import { FieldMapping, ZapInput, ZapService } from '../zap.service';

@Component({
  selector: 'app-zap-editor',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './zap-editor.component.html',
  styleUrl: './zap-editor.component.css',
})
export class ZapEditorComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly zapsApi = inject(ZapService);
  private readonly githubApi = inject(GitHubService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  @ViewChild('actionBodyInput')
  private actionBodyInput?: ElementRef<HTMLTextAreaElement>;

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly isEdit = signal(false);

  readonly apps = DEVELOPER_APPS;
  readonly appIsWired = appIsWired;
  readonly bodyFieldMappings = BODY_FIELD_MAPPINGS;
  readonly triggerEvents = signal<string[]>(
    eventsForApp(TRIGGER_EVENTS_BY_APP, DEVELOPER_APPS[0])
  );
  readonly actionEvents = signal<string[]>(
    eventsForApp(ACTION_EVENTS_BY_APP, DEVELOPER_APPS[0])
  );

  readonly repositories = signal<GitHubRepo[]>([]);
  readonly reposLoading = signal(false);
  readonly reposError = signal<string | null>(null);

  private zapId: string | null = null;
  /** Skip resetting the event while hydrating an existing Zap. */
  private hydrating = false;
  private reposLoaded = false;
  private reposRequestInFlight = false;

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    isOn: [false],
    triggerApp: this.fb.nonNullable.control<string>(
      DEVELOPER_APPS[0],
      Validators.required
    ),
    triggerEvent: this.fb.nonNullable.control<string>(
      eventsForApp(TRIGGER_EVENTS_BY_APP, DEVELOPER_APPS[0])[0] ?? '',
      Validators.required
    ),
    triggerRepository: [''],
    actionApp: this.fb.nonNullable.control<string>(
      DEVELOPER_APPS[0],
      Validators.required
    ),
    actionEvent: this.fb.nonNullable.control<string>(
      eventsForApp(ACTION_EVENTS_BY_APP, DEVELOPER_APPS[0])[0] ?? '',
      Validators.required
    ),
    actionRepository: [''],
    actionBody: [''],
  });

  constructor() {
    this.form.controls.triggerApp.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((app) => this.onTriggerAppChange(app));

    this.form.controls.actionApp.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((app) => this.onActionAppChange(app));

    this.syncGitHubRepoValidators();
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');

    if (!id || id === 'new') {
      this.isEdit.set(false);
      this.loading.set(false);
      this.ensureGitHubReposLoaded();
      return;
    }

    this.isEdit.set(true);
    this.zapId = id;

    this.zapsApi.get(id).subscribe({
      next: (zap) => {
        this.hydrating = true;
        this.triggerEvents.set(
          eventsForApp(TRIGGER_EVENTS_BY_APP, zap.trigger.app)
        );
        this.actionEvents.set(
          eventsForApp(ACTION_EVENTS_BY_APP, zap.action.app)
        );

        this.form.patchValue({
          name: zap.name,
          isOn: zap.isOn,
          triggerApp: zap.trigger.app,
          triggerEvent: zap.trigger.event,
          triggerRepository: zap.trigger.configuration?.['repository'] ?? '',
          actionApp: zap.action.app,
          actionEvent: zap.action.event,
          actionRepository: zap.action.configuration?.['repository'] ?? '',
          actionBody: zap.action.configuration?.['body'] ?? '',
        });
        this.syncGitHubRepoValidators();
        this.hydrating = false;

        this.loading.set(false);
        this.ensureGitHubReposLoaded();
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Could not load this Zap.');
      },
    });
  }

  isGitHub(app: string): boolean {
    return isGitHubApp(app);
  }

  /** Insert a mapped trigger field token into the Body at the cursor. */
  insertBodyField(token: string): void {
    const control = this.form.controls.actionBody;
    const el = this.actionBodyInput?.nativeElement;
    const insertion = bodyFieldToken(token);
    const current = control.value;

    if (!el) {
      control.setValue(`${current}${insertion}`);
      return;
    }

    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const next = `${current.slice(0, start)}${insertion}${current.slice(end)}`;
    control.setValue(next);

    const cursor = start + insertion.length;
    queueMicrotask(() => {
      el.focus();
      el.setSelectionRange(cursor, cursor);
    });
  }

  save(): void {
    this.error.set(null);
    this.form.markAllAsTouched();

    if (this.form.invalid) {
      this.error.set('Fill in the required Zap fields.');
      return;
    }

    const raw = this.form.getRawValue();
    const actionBody = raw.actionBody;
    const fieldMappings: FieldMapping[] = bodyTokensInMessage(actionBody).map(
      (token) => ({
        targetField: 'body',
        sourceField: token,
      })
    );

    const body: ZapInput = {
      name: raw.name.trim(),
      isOn: raw.isOn,
      trigger: {
        app: raw.triggerApp.trim(),
        event: raw.triggerEvent.trim(),
        configuration: this.isGitHub(raw.triggerApp)
          ? this.configFromFields({
              repository: raw.triggerRepository,
            })
          : {},
      },
      action: {
        app: raw.actionApp.trim(),
        event: raw.actionEvent.trim(),
        configuration: this.isGitHub(raw.actionApp)
          ? this.configFromFields({
              repository: raw.actionRepository,
              body: actionBody,
            })
          : {},
        ...(fieldMappings.length > 0 ? { fieldMappings } : {}),
      },
    };

    this.saving.set(true);

    const request$ =
      this.isEdit() && this.zapId
        ? this.zapsApi.update(this.zapId, body)
        : this.zapsApi.create(body);

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        void this.router.navigate(['/zaps']);
      },
      error: (err: { error?: { message?: string } }) => {
        this.saving.set(false);
        this.error.set(err.error?.message ?? 'Could not save this Zap.');
      },
    });
  }

  private onTriggerAppChange(app: string): void {
    const events = eventsForApp(TRIGGER_EVENTS_BY_APP, app);
    this.triggerEvents.set(events);
    if (!this.hydrating) {
      this.form.controls.triggerEvent.setValue(events[0] ?? '');
      if (!this.isGitHub(app)) {
        this.form.controls.triggerRepository.setValue('');
      }
    }
    this.syncGitHubRepoValidators();
    this.ensureGitHubReposLoaded();
  }

  private onActionAppChange(app: string): void {
    const events = eventsForApp(ACTION_EVENTS_BY_APP, app);
    this.actionEvents.set(events);
    if (!this.hydrating) {
      this.form.controls.actionEvent.setValue(events[0] ?? '');
      if (!this.isGitHub(app)) {
        this.form.controls.actionRepository.setValue('');
        this.form.controls.actionBody.setValue('');
      }
    }
    this.syncGitHubRepoValidators();
    this.ensureGitHubReposLoaded();
  }

  private syncGitHubRepoValidators(): void {
    const triggerRepo = this.form.controls.triggerRepository;
    const actionRepo = this.form.controls.actionRepository;

    triggerRepo.setValidators(
      this.isGitHub(this.form.controls.triggerApp.value)
        ? [Validators.required]
        : []
    );
    actionRepo.setValidators(
      this.isGitHub(this.form.controls.actionApp.value)
        ? [Validators.required]
        : []
    );

    triggerRepo.updateValueAndValidity({ emitEvent: false });
    actionRepo.updateValueAndValidity({ emitEvent: false });
  }

  /** Fetch GitHub repos once when either step uses GitHub. */
  private ensureGitHubReposLoaded(): void {
    const needsRepos =
      this.isGitHub(this.form.controls.triggerApp.value) ||
      this.isGitHub(this.form.controls.actionApp.value);

    if (!needsRepos) {
      return;
    }

    if (this.reposLoaded || this.reposRequestInFlight) {
      return;
    }

    this.reposRequestInFlight = true;
    this.reposLoading.set(true);
    this.reposError.set(null);

    this.githubApi.listRepos().subscribe({
      next: (repos) => {
        this.repositories.set(repos);
        this.reposLoaded = true;
        this.reposLoading.set(false);
        this.reposRequestInFlight = false;
      },
      error: () => {
        this.reposLoading.set(false);
        this.reposRequestInFlight = false;
        this.reposError.set(
          'Could not load GitHub repositories. Try signing out and back in so repo access is granted.'
        );
      },
    });
  }

  private configFromFields(
    fields: Record<string, string>
  ): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(fields)) {
      const trimmed = value.trim();
      if (trimmed) {
        // Preserve intentional newlines in body; only trim outer whitespace.
        result[key] = key === 'body' ? value.replace(/^\s+|\s+$/g, '') : trimmed;
      }
    }
    return result;
  }
}
