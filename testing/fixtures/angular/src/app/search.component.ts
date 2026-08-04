import { Component, OnInit, Input } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer } from '@angular/platform-browser';

@Component({
  selector: 'app-search',
  template: `
    <div (click)="clear()">Clear</div>
    <input [(ngModel)]="query" (keyup)="onKey()" />
    <div [innerHTML]="renderedBio"></div>
    <div *ngFor="let r of results">
      <img [src]="r.thumb" />
      <button (click)="select(r)"><i class="icon-trash"></i></button>
    </div>
  `,
})
export class SearchComponent implements OnInit {
  @Input() userId: string;

  query = '';
  results: any[] = [];
  renderedBio: any;
  private subscription: any;

  constructor(private http: HttpClient, private sanitizer: DomSanitizer) {}

  ngOnInit() {
    this.subscription = this.http
      .get(`/api/users/${this.userId}`)
      .subscribe((u: any) => {
        this.renderedBio = this.sanitizer.bypassSecurityTrustHtml(u.bio);
      });
  }

  onKey() {
    this.http
      .get(`/api/search?q=${this.query}`)
      .subscribe((r: any) => (this.results = r));
  }

  select(row: any) {
    this.http.post('/api/select', { id: row.id }).subscribe();
  }

  clear() {
    this.query = '';
  }
}
