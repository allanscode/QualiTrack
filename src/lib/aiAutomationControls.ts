import { getMockData, setMockData } from './mockDb';
import { supabase } from './supabase';

export type AutomationName = 'positivas' | 'filhos';

export interface AIAutomationControl {
  automation: AutomationName;
  enabled: boolean;
  max_evaluations: number | null;
  executions_started: number;
  auditor_ready: boolean;
  last_error: string | null;
  changed_at: string | null;
}

const MOCK_KEY = 'ai_automation_controls';
const MOCK_DEFAULTS: AIAutomationControl[] = [
  { automation: 'positivas', enabled: false, max_evaluations: null, executions_started: 0, auditor_ready: true, last_error: null, changed_at: null },
  { automation: 'filhos', enabled: false, max_evaluations: null, executions_started: 0, auditor_ready: true, last_error: null, changed_at: null },
];

export async function getAIAutomationControls(): Promise<AIAutomationControl[]> {
  if (!supabase) {
    const saved = getMockData<AIAutomationControl>(MOCK_KEY);
    return MOCK_DEFAULTS.map(defaultControl => saved.find(item => item.automation === defaultControl.automation) ?? defaultControl);
  }
  const { data, error } = await supabase.rpc('get_ai_automation_controls');
  if (error) throw error;
  return (data ?? []) as AIAutomationControl[];
}

export async function setAIAutomationEnabled(
  automation: AutomationName,
  enabled: boolean,
  expectedEnabled: boolean,
): Promise<void> {
  if (!supabase) {
    const controls = await getAIAutomationControls();
    const current = controls.find(item => item.automation === automation);
    if (!current || current.enabled !== expectedEnabled) throw new Error('O estado mudou. Atualize a tela e tente novamente.');
    setMockData(MOCK_KEY, controls.map(item => item.automation === automation
      ? { ...item, enabled, changed_at: new Date().toISOString() } : item));
    return;
  }
  const { error } = await supabase.rpc('set_ai_automation_enabled', {
    p_automation: automation,
    p_enabled: enabled,
    p_expected_enabled: expectedEnabled,
  });
  if (error) throw error;
}
