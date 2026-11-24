-- Página «Tarefas»: o planeador das tarefas e o estado novo «Enviar proposta» dos leads.
-- Corre no SQL Editor do Supabase (uma vez; é seguro repetir).

-- 1. Planeador: em que coluna do planeador está cada tarefa (a vista «Planeador» da página Tarefas)
alter table tarefas add column if not exists planeamento text not null default 'nao_planeado'
    check (planeamento in ('nao_planeado', 'em_curso', 'esta_semana', 'revisao'));
create index if not exists idx_tarefas_planeamento on tarefas (planeamento) where concluida_em is null;

-- 2. Estado novo dos leads: «enviar_proposta» (entre «reunião agendada» e «proposta enviada»).
--    Apaga a regra antiga do estado (seja qual for o nome que tenha) e cria a nova com todos os estados.
do $$
declare c text;
begin
    for c in
        select conname from pg_constraint
        where conrelid = 'leads'::regclass and contype = 'c'
          and pg_get_constraintdef(oid) like '%estado%' and pg_get_constraintdef(oid) like '%reuniao_agendada%'
    loop
        execute format('alter table leads drop constraint %I', c);
    end loop;
    alter table leads add constraint leads_estado_check check (estado in (
        'novo', 'analisado', 'contactado', 'respondeu', 'reuniao_agendada', 'enviar_proposta', 'proposta_enviada',
        'proposta_aceite', 'proposta_recusada', 'negocio_fechado', 'nao_contactar', 'oportunidade_perdida'));
end $$;

-- 3. Hora da reunião (e de qualquer tarefa): opcional. A reunião agendada leva dia e hora.
alter table tarefas add column if not exists hora time;
