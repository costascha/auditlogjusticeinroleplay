create sequence if not exists public.ticket_number_seq
    as bigint
    minvalue 1000000000000000
    maxvalue 9999999999999999
    start with 1000000000000000
    increment by 1
    no cycle;

create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    is_admin boolean not null default false,
    created_at timestamptz not null default now()
);

create table if not exists public.tickets (
    ticket_number text primary key,
    user_id uuid not null references auth.users (id) on delete cascade,
    subject text not null check (char_length(btrim(subject)) between 1 and 120),
    description text not null check (char_length(btrim(description)) between 1 and 5000),
    status text not null default 'open'
        check (status in ('open', 'in_progress', 'resolved', 'closed')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint ticket_number_format check (ticket_number ~ '^1-[0-9]{16}$')
);

create index if not exists tickets_user_created_idx
    on public.tickets (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.tickets enable row level security;
grant usage on schema public to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.profiles
        where id = (select auth.uid())
          and is_admin
    );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id) values (new.id);
    return new;
end;
$$;

revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;
drop trigger if exists create_profile_after_signup on auth.users;
create trigger create_profile_after_signup
    after insert on auth.users
    for each row execute function public.create_profile_for_new_user();

insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

create or replace function public.prepare_new_ticket()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null then
        raise exception 'An authenticated user is required to create a ticket';
    end if;

    new.ticket_number := '1-' || lpad(nextval('public.ticket_number_seq')::text, 16, '0');
    new.user_id := auth.uid();
    new.status := 'open';
    new.created_at := now();
    new.updated_at := new.created_at;
    return new;
end;
$$;

revoke all on function public.prepare_new_ticket() from public, anon, authenticated;
drop trigger if exists prepare_ticket_before_insert on public.tickets;
create trigger prepare_ticket_before_insert
    before insert on public.tickets
    for each row execute function public.prepare_new_ticket();

create or replace function public.set_ticket_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

revoke all on function public.set_ticket_updated_at() from public, anon, authenticated;
drop trigger if exists set_ticket_updated_at on public.tickets;
create trigger set_ticket_updated_at
    before update on public.tickets
    for each row execute function public.set_ticket_updated_at();

drop policy if exists "Users read own tickets and admins read all" on public.tickets;
create policy "Users read own tickets and admins read all"
    on public.tickets for select to authenticated
    using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "Users create tickets for themselves" on public.tickets;
create policy "Users create tickets for themselves"
    on public.tickets for insert to authenticated
    with check ((select auth.uid()) = user_id);

drop policy if exists "Admins update tickets" on public.tickets;
create policy "Admins update tickets"
    on public.tickets for update to authenticated
    using ((select public.is_admin()))
    with check ((select public.is_admin()));

drop policy if exists "Users read their own profile" on public.profiles;
create policy "Users read their own profile"
    on public.profiles for select to authenticated
    using ((select auth.uid()) = id);

grant select on public.profiles to authenticated;
grant select, insert on public.tickets to authenticated;
grant update (status) on public.tickets to authenticated;
