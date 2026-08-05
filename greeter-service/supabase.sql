create table if not exists greeter_claims (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'submitted' check (status in ('submitted','preview_ready','approved','disabled')),
  business_name text not null,
  website_url text not null,
  contact_name text,
  contact_email text not null,
  human_escalation text not null,
  primary_cta text not null,
  approved_context text not null,
  public_source_url text,
  preview_token uuid not null unique default gen_random_uuid(),
  widget_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  disabled_at timestamptz
);

create table if not exists greeter_questions (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references greeter_claims(id) on delete cascade,
  question text not null,
  answer text not null,
  was_escalated boolean not null default false,
  created_at timestamptz not null default now()
);

alter table greeter_claims enable row level security;
alter table greeter_questions enable row level security;
-- The service role is the only writer/reader. Do not expose it to browsers.
