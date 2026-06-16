import React, { createContext, useContext, useCallback, useMemo, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { User, Team, EvaluationForm, DissatisfactionField, UserTeam, UserPreferences } from '../types';
import { supabase, mockDb, isMockMode } from './supabase';
import { toast } from 'sonner';

interface StaticDataContextType {
  users: User[];
  teams: Team[];
  forms: EvaluationForm[];
  dissatisfactionFields: DissatisfactionField[];
  userTeams: UserTeam[];
  userPreferences: Record<string, UserPreferences>;
  loading: boolean;
  refreshAll: () => void;
}

const StaticDataContext = createContext<StaticDataContextType | undefined>(undefined);

function enrichUsersWithTeams(usersList: User[], userTeamDocs: UserTeam[], prefsMap: Record<string, UserPreferences>): User[] {
  const teamIdsByUser: Record<string, string[]> = {};
  userTeamDocs.forEach((ut: UserTeam) => {
    if (!teamIdsByUser[ut.user_id]) teamIdsByUser[ut.user_id] = [];
    teamIdsByUser[ut.user_id].push(ut.team_id);
  });
  return usersList.map(u => ({
    ...u,
    team_ids: u.team_ids?.length ? u.team_ids : (teamIdsByUser[u.id] || []),
    preferences: prefsMap[u.id] || u.preferences
  }));
}

async function fetchAllStaticData() {
  if (isMockMode) {
    const [uRes, tRes, fRes, dfRes, utRes, upRes] = await Promise.all([
      mockDb.get('users'),
      mockDb.get('teams'),
      mockDb.get('forms'),
      mockDb.get('dissatisfaction_fields'),
      mockDb.get('user_teams'),
      mockDb.get('user_preferences')
    ]);
    const prefsMap: Record<string, UserPreferences> = {};
    (upRes.data || []).forEach((row: any) => {
      if (row.user_id && row.preferences) {
        prefsMap[row.user_id] = row.preferences as UserPreferences;
      }
    });
    const enrichedUsers = enrichUsersWithTeams(
      (uRes.data || []) as User[],
      (utRes.data || []) as UserTeam[],
      prefsMap
    );
    return {
      users: enrichedUsers,
      teams: (tRes.data || []) as Team[],
      forms: (fRes.data || []) as EvaluationForm[],
      dissatisfactionFields: (dfRes.data || []) as DissatisfactionField[],
      userTeams: (utRes.data || []) as UserTeam[],
      userPreferences: prefsMap,
    };
  } else {
    const sb = supabase!;
    const executeWithRetry = async (retryCount = 0): Promise<any> => {
      try {
        console.log(`[StaticData] Carregando dados cadastrais (Tentativa ${retryCount + 1})...`);
        const controller = new AbortController();

        const fetchPromise = Promise.all([
          sb.from('users').select('*').abortSignal(controller.signal),
          sb.from('teams').select('*').abortSignal(controller.signal),
          sb.from('forms').select('*').abortSignal(controller.signal),
          sb.from('dissatisfaction_fields').select('*').abortSignal(controller.signal),
          sb.from('user_teams').select('*').abortSignal(controller.signal),
          sb.from('user_preferences').select('*').abortSignal(controller.signal)
        ]);

        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, 15000);
        });

        const results = await Promise.race([fetchPromise, timeoutPromise]) as any[];
        const [uRes, tRes, fRes, dfRes, utRes, upRes] = results;

        const prefsMap: Record<string, UserPreferences> = {};
        (upRes.data || []).forEach((row: any) => {
          if (row.user_id && row.preferences) {
            prefsMap[row.user_id] = row.preferences as UserPreferences;
          }
        });
        const enrichedUsers = enrichUsersWithTeams(
          (uRes.data || []) as User[],
          (utRes.data || []) as UserTeam[],
          prefsMap
        );
        return {
          users: enrichedUsers,
          teams: (tRes.data || []) as Team[],
          forms: (fRes.data || []) as EvaluationForm[],
          dissatisfactionFields: (dfRes.data || []) as DissatisfactionField[],
          userTeams: (utRes.data || []) as UserTeam[],
          userPreferences: prefsMap,
        };
      } catch (error: any) {
        if (error?.message === 'timeout' && retryCount < 2) {
          console.warn(`[StaticData] Timeout. Retrying (${retryCount + 1}/2)...`);
          await new Promise(r => setTimeout(r, 2000 * (retryCount + 1)));
          return executeWithRetry(retryCount + 1);
        }
        throw error;
      }
    };
    return executeWithRetry();
  }
}

export function StaticDataProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['staticData'],
    queryFn: fetchAllStaticData,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 2,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false, // CORRECTION 5: custom qualitrack:reconnected event handles this
  });

  const refreshAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['staticData'] });
  }, [queryClient]);

  const contextValue = useMemo(() => ({
    users: data?.users || [],
    teams: data?.teams || [],
    forms: data?.forms || [],
    dissatisfactionFields: data?.dissatisfactionFields || [],
    userTeams: data?.userTeams || [],
    userPreferences: data?.userPreferences || {},
    loading: isLoading,
    refreshAll,
  }), [data, isLoading, refreshAll]);

  return (
    <StaticDataContext.Provider value={contextValue}>
      {children}
    </StaticDataContext.Provider>
  );
}

export function useStaticData(): StaticDataContextType {
  const context = useContext(StaticDataContext);
  if (context === undefined) {
    throw new Error('useStaticData must be used within a StaticDataProvider');
  }
  return context;
}