-- Gmail sign-ups allowed (owner's request, Nov 2026)
delete from public.blocked_email_domains where domain in ('gmail.com','googlemail.com');
