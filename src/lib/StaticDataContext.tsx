import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { User, Team, EvaluationForm, DissatisfactionField, UserTeam, UserPreferences } from '../types';
import { supabase, mockDb } from './supabase';
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

export function StaticDataProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [forms, setForms] = useState<EvaluationForm[]>([]);
  const [dissatisfactionFields, setDissatisfactionFields] = useState<DissatisfactionField[]>([]);
  const [userTeams, setUserTeams] = useState<UserTeam[]>([]);
  const [userPreferences, setUserPreferences] = useState<Record<string, UserPreferences>>({});
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const fetchingRef = useRef(false);
  const fetchedRef = useRef(false);

  const fetchStaticData = useCallback(async () => {
    if (fetchingRef.current) {
      console.log('[StaticData] Fetch já em andamento, ignorando...');
      return;
    }
    fetchingRef.current = true;
    fetchedRef.current = false;
    setLoading(true);
    try {
      if (!supabase) {
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
        setUserPreferences(prefsMap);
        const enrichedUsers = enrichUsersWithTeams(
          (uRes.data || []) as User[],
          (utRes.data || []) as UserTeam[],
          prefsMap
        );
        setUsers(enrichedUsers);
        setTeams((tRes.data || []) as Team[]);
        setForms((fRes.data || []) as EvaluationForm[]);
        setDissatisfactionFields((dfRes.data || []) as DissatisfactionField[]);
        setUserTeams((utRes.data || []) as UserTeam[]);
      } else {
        const executeWithRetry = async (retryCount = 0): Promise<void> => {
          try {
            console.log(`[StaticData] Carregando dados cadastrais (Tentativa ${retryCount + 1})...`);
            const controller = new AbortController();

          const fetchPromise = Promise.all([
            supabase.from('users').select('*').abortSignal(controller.signal),
            supabase.from('teams').select('*').abortSignal(controller.signal),
            supabase.from('forms').select('*').abortSignal(controller.signal),
            supabase.from('dissatisfaction_fields').select('*').abortSignal(controller.signal),
            supabase.from('user_teams').select('*').abortSignal(controller.signal),
            supabase.from('user_preferences').select('*').abortSignal(controller.signal)
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
          setUserPreferences(prefsMap);
          const enrichedUsers = enrichUsersWithTeams(
            (uRes.data || []) as User[],
            (utRes.data || []) as UserTeam[],
            prefsMap
          );
            setUsers(enrichedUsers);
            setTeams((tRes.data || []) as Team[]);
            setForms((fRes.data || []) as EvaluationForm[]);
            setDissatisfactionFields((dfRes.data || []) as DissatisfactionField[]);
            setUserTeams((utRes.data || []) as UserTeam[]);
          } catch (error: any) {
            if (error?.message === 'timeout' && retryCount < 2) {
              console.warn(`[StaticData] Timeout. Retrying (${retryCount + 1}/2)...`);
              await new Promise(r => setTimeout(r, 2000 * (retryCount + 1)));
              return executeWithRetry(retryCount + 1);
            }
            throw error;
          }
        };
        await executeWithRetry();
      }
    } catch (e) {
      console.error('[StaticData] Erro ao carregar dados cadastrais:', e);
      toast.error('Erro ao carregar dados cadastrais. Tente atualizar a página.');
    } finally {
      setLoading(false);
      fetchedRef.current = true;
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (fetchedRef.current || fetchingRef.current) return;
    fetchStaticData();
  }, [fetchStaticData]);

  useEffect(() => {
    if (refreshTrigger === 0) return;
    fetchStaticData();
  }, [refreshTrigger, fetchStaticData]);

  const refreshAll = useCallback(() => {
    fetchingRef.current = false;
    fetchedRef.current = false;
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return (
    <StaticDataContext.Provider value={{ users, teams, forms, dissatisfactionFields, userTeams, userPreferences, loading, refreshAll }}>
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
