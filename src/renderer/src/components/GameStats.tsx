import React, { useEffect, useState, useMemo } from 'react';
import { Game, PlaytimeSession } from '@shared/types/game';
import { Clock, Calendar, Gamepad2, Timer, BarChart2, ChevronDown, ChevronUp } from 'lucide-react';

interface GameStatsProps {
  game: Game;
}

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function formatRelativeTime(dateIso?: string): string {
  if (!dateIso) return 'Nunca jogado';
  const date = new Date(dateIso);
  const time = date.getTime();
  if (isNaN(time)) return 'Nunca jogado';

  const now = Date.now();
  const diffMs = now - time;
  if (diffMs < 0) return 'Agora mesmo';

  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMin < 1) return 'Agora mesmo';
  if (diffMin < 60) return `há ${diffMin} min`;
  if (diffHours < 24) return `há ${diffHours} ${diffHours === 1 ? 'hora' : 'horas'}`;
  if (diffDays === 1) return 'há 1 dia';
  if (diffDays < 30) return `há ${diffDays} dias`;
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `há ${months} ${months === 1 ? 'mês' : 'meses'}`;
  }
  const years = Math.floor(diffDays / 365);
  return `há ${years} ${years === 1 ? 'ano' : 'anos'}`;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0 min';
  if (seconds < 60) return '< 1 min';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h}h ${m}m`;
}

interface DayStats {
  label: string;
  dateStr: string;
  minutes: number;
}

export const GameStats: React.FC<GameStatsProps> = ({ game }) => {
  const [sessions, setSessions] = useState<PlaytimeSession[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Recarrega sessões ao montar ou quando o tempo total mudar (fim de sessão)
  useEffect(() => {
    let isMounted = true;
    window.electronAPI?.getPlaytimeSessions(game.id).then((data) => {
      if (isMounted) {
        setSessions(data || []);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [game.id, game.totalPlaytimeSeconds]);

  // Agrupamento dos últimos 7 dias dividindo sessões que atravessam a meia-noite
  const last7Days = useMemo<DayStats[]>(() => {
    const now = new Date();
    const days: DayStats[] = [];

    for (let i = 6; i >= 0; i--) {
      // Início e fim do dia no fuso local do usuário
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 0, 0, 0, 0);
      const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 23, 59, 59, 999);
      const dayStartMs = dayStart.getTime();
      const dayEndMs = dayEnd.getTime() + 1; // 00:00 do dia seguinte

      let totalMinutes = 0;

      for (const s of sessions) {
        const sStart = new Date(s.startedAt).getTime();
        const sEnd = new Date(s.endedAt).getTime();
        if (isNaN(sStart) || isNaN(sEnd) || sEnd <= sStart) continue;

        // Calcula a intersecção exata com este dia civil
        const overlapStart = Math.max(sStart, dayStartMs);
        const overlapEnd = Math.min(sEnd, dayEndMs);

        if (overlapEnd > overlapStart) {
          totalMinutes += (overlapEnd - overlapStart) / 60000;
        }
      }

      days.push({
        label: i === 0 ? 'Hoje' : WEEKDAYS[dayStart.getDay()],
        dateStr: `${String(dayStart.getDate()).padStart(2, '0')}/${String(dayStart.getMonth() + 1).padStart(2, '0')}`,
        minutes: Math.round(totalMinutes)
      });
    }

    return days;
  }, [sessions]);

  const maxMinutesInWeek = useMemo(() => {
    return Math.max(...last7Days.map((d) => d.minutes), 0);
  }, [last7Days]);

  const averagePerSession = useMemo(() => {
    if (sessions.length === 0 || !game.totalPlaytimeSeconds) return '—';
    return formatDuration(game.totalPlaytimeSeconds / sessions.length);
  }, [sessions.length, game.totalPlaytimeSeconds]);

  return (
    <div className="mt-3 pt-3 border-t border-slate-800/70 text-slate-200">
      {/* Header com botão recolhível */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
          <BarChart2 className="w-3.5 h-3.5 text-indigo-400" />
          <span>Estatísticas de Jogo</span>
        </div>
        <button
          onClick={() => setIsCollapsed((prev) => !prev)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-colors ${focusRing}`}
          title={isCollapsed ? 'Expandir estatísticas' : 'Recolher estatísticas'}
        >
          <span>{isCollapsed ? 'Expandir' : 'Recolher'}</span>
          {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>
      </div>

      {!isCollapsed && (
        <div className="flex flex-col lg:flex-row items-stretch gap-3">
          {/* 4 Cards de Indicadores */}
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {/* 1. Tempo total */}
            <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/80 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                <Clock className="w-3 h-3 text-indigo-400" />
                <span>Tempo total</span>
              </div>
              <div className="mt-1 text-sm sm:text-base font-extrabold text-white truncate" title={formatDuration(game.totalPlaytimeSeconds)}>
                {formatDuration(game.totalPlaytimeSeconds)}
              </div>
            </div>

            {/* 2. Última vez jogado */}
            <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/80 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                <Calendar className="w-3 h-3 text-indigo-400" />
                <span>Última vez</span>
              </div>
              <div className="mt-1 text-xs sm:text-sm font-bold text-slate-200 truncate" title={formatRelativeTime(game.lastPlayedAt)}>
                {formatRelativeTime(game.lastPlayedAt)}
              </div>
            </div>

            {/* 3. Quantidade de Sessões */}
            <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/80 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                <Gamepad2 className="w-3 h-3 text-indigo-400" />
                <span>Sessões</span>
              </div>
              <div className="mt-1 text-sm sm:text-base font-extrabold text-white">
                {sessions.length}
              </div>
            </div>

            {/* 4. Média por Sessão */}
            <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/80 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                <Timer className="w-3 h-3 text-indigo-400" />
                <span>Média / sessão</span>
              </div>
              <div className="mt-1 text-sm sm:text-base font-extrabold text-white truncate" title={averagePerSession}>
                {averagePerSession}
              </div>
            </div>
          </div>

          {/* Gráfico de Barras - Últimos 7 Dias */}
          <div className="w-full lg:w-72 p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/80 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-400 mb-1.5">
              <span>Últimos 7 dias</span>
              <span className="text-[10px] text-slate-500">
                {maxMinutesInWeek > 0 ? `pico: ${maxMinutesInWeek}m` : 'sem atividade'}
              </span>
            </div>

            {/* Barras */}
            <div className="grid grid-cols-7 gap-1.5 items-end h-14 pt-1">
              {last7Days.map((day, idx) => {
                const heightPercent =
                  maxMinutesInWeek > 0 && day.minutes > 0
                    ? Math.max(14, Math.round((day.minutes / maxMinutesInWeek) * 100))
                    : 0;

                const isToday = idx === 6;

                return (
                  <div
                    key={`${day.label}-${day.dateStr}`}
                    className="flex flex-col items-center justify-end h-full group relative"
                    title={`${day.label} (${day.dateStr}): ${day.minutes} min`}
                  >
                    {/* Tooltip simples no hover */}
                    <div className="absolute -top-7 hidden group-hover:flex px-1.5 py-0.5 rounded bg-slate-950 border border-slate-700 text-[9px] font-bold text-indigo-300 whitespace-nowrap z-30 shadow-lg pointer-events-none">
                      {day.minutes}m
                    </div>

                    {/* Barra */}
                    <div className="w-full h-full flex items-end justify-center">
                      {heightPercent > 0 ? (
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className={`w-full rounded-sm transition-all duration-300 ${
                            isToday
                              ? 'bg-gradient-to-t from-indigo-600 to-indigo-400 shadow-sm shadow-indigo-500/30'
                              : 'bg-indigo-500/80 hover:bg-indigo-400'
                          }`}
                        />
                      ) : (
                        <div className="w-full h-1 rounded-full bg-slate-800" />
                      )}
                    </div>

                    {/* Rótulo do dia */}
                    <span
                      className={`text-[9px] mt-1 font-semibold truncate ${
                        isToday ? 'text-indigo-400 font-bold' : 'text-slate-500'
                      }`}
                    >
                      {day.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
