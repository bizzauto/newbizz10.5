import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare, Plus, Trash2, Edit3, ChevronUp, ChevronDown,
  Zap, Clock, Tag, UserX, GitBranch, ArrowDown, Save, X,
  HelpCircle, Loader, CheckCircle
} from 'lucide-react';
import { whatsappFlowAPI } from '../lib/api';

// ============================================================
// TYPES
// ============================================================

type NodeType = 'message' | 'question' | 'condition' | 'delay' | 'tag' | 'handoff' | 'jump';

interface FlowNode {
  id: string;
  type: NodeType;
  data: {
    text?: string;
    mediaUrl?: string;
    mediaType?: 'image' | 'video' | 'document' | 'audio';
    saveAs?: string;
    variable?: string;
    operator?: 'contains' | 'equals' | 'not_empty';
    value?: string;
    seconds?: number;
    tags?: string[];
    targetNodeId?: string;
    notes?: string;
    yesTarget?: string;
    noTarget?: string;
  };
}

interface FlowTrigger {
  type: 'keyword' | 'first_message' | 'any_message';
  keyword?: string;
  matchType?: 'contains' | 'exact';
}

interface FlowListItem {
  id: string;
  name: string;
  description?: string | null;
  trigger: FlowTrigger;
  isActive: boolean;
  reentryHours: number;
  priority: number;
  runCount: number;
  totalSessions: number;
  activeSessions: number;
  nodeCount: number;
}

const NODE_META: Record<NodeType, { label: string; icon: React.ReactNode; color: string }> = {
  message: { label: 'Message', icon: <MessageSquare size={14} />, color: 'bg-green-100 text-green-700' },
  question: { label: 'Question', icon: <HelpCircle size={14} />, color: 'bg-blue-100 text-blue-700' },
  condition: { label: 'Condition', icon: <GitBranch size={14} />, color: 'bg-amber-100 text-amber-700' },
  delay: { label: 'Delay', icon: <Clock size={14} />, color: 'bg-gray-100 text-gray-600' },
  tag: { label: 'Tag Contact', icon: <Tag size={14} />, color: 'bg-purple-100 text-purple-700' },
  handoff: { label: 'Human Handoff', icon: <UserX size={14} />, color: 'bg-red-100 text-red-700' },
  jump: { label: 'Jump To', icon: <Zap size={14} />, color: 'bg-indigo-100 text-indigo-700' },
};

const emptyNode = (): FlowNode => ({ id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, type: 'message', data: { text: '' } });

// ============================================================
// MAIN COMPONENT
// ============================================================

const WhatsAppFlowBuilder: React.FC = () => {
  const [flows, setFlows] = useState<FlowListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ id?: string; name: string; description: string; trigger: FlowTrigger; matchType: 'contains' | 'exact'; reentryHours: number; priority: number; nodes: FlowNode[] } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await whatsappFlowAPI.list();
      setFlows(res?.data?.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const startNew = () => {
    const first = emptyNode();
    first.data.text = '{Namaste|Hello|Hi} {name}! 👋';
    setEditing({ name: '', description: '', trigger: { type: 'keyword', keyword: '' }, matchType: 'contains', reentryHours: 24, priority: 0, nodes: [first] });
  };

  const startEdit = async (id: string) => {
    try {
      const res = await whatsappFlowAPI.get(id);
      const f = res?.data?.data;
      if (!f) return;
      const nodes: FlowNode[] = ((f.graph?.nodes || []) as any[]).map((n) => ({
        id: n.id,
        type: n.type,
        data: { ...n.data, yesTarget: n.data?.yesTarget, noTarget: n.data?.noTarget },
      }));
      setEditing({
        id: f.id,
        name: f.name,
        description: f.description || '',
        trigger: f.trigger || { type: 'keyword', keyword: '' },
        matchType: f.trigger?.matchType || 'contains',
        reentryHours: f.reentryHours ?? 24,
        priority: f.priority ?? 0,
        nodes: nodes.length ? nodes : [emptyNode()],
      });
    } catch { /* ignore */ }
  };

  const save = async () => {
    if (!editing || !editing.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: editing.name,
        description: editing.description || undefined,
        trigger: (editing.trigger.type === 'keyword'
          ? { type: 'keyword', keyword: editing.trigger.keyword || '', matchType: editing.matchType }
          : { type: editing.trigger.type }) as FlowTrigger & { matchType?: 'contains' | 'exact' },
        graph: buildGraph(editing.nodes),
        reentryHours: editing.reentryHours,
        priority: editing.priority,
      };
      if (editing.id) await whatsappFlowAPI.update(editing.id, payload);
      else await whatsappFlowAPI.create(payload);
      setEditing(null);
      await load();
    } catch { /* ignore */ }
    setSaving(false);
  };

  const toggle = async (id: string) => {
    try { await whatsappFlowAPI.toggle(id); await load(); } catch { /* ignore */ }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this flow? Active sessions will also be removed.')) return;
    try { await whatsappFlowAPI.remove(id); await load(); } catch { /* ignore */ }
  };

  if (editing) {
    return (
      <FlowEditor
        draft={editing}
        setDraft={setEditing}
        onSave={save}
        onCancel={() => setEditing(null)}
        saving={saving}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><Zap size={22} className="text-green-600" /> Flow Builder</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Visual chatbot flows — trigger → steps → branches. Runs before AI auto-reply.</p>
          </div>
          <button onClick={startNew} className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600">
            <Plus size={16} /> New Flow
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400"><Loader size={24} className="animate-spin" /></div>
        ) : flows.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
            <Zap size={48} className="mx-auto text-gray-300 mb-4" />
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">No flows yet</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Create your first chatbot flow — e.g. keyword "price" → pricing info → ask budget → tag lead</p>
            <button onClick={startNew} className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600">+ New Flow</button>
          </div>
        ) : (
          <div className="space-y-3">
            {flows.map((f) => (
              <div key={f.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
                <button onClick={() => toggle(f.id)} className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors ${f.isActive ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                  <div className={`absolute w-5 h-5 bg-white rounded-full top-0.5 transition-transform shadow-sm ${f.isActive ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 dark:text-white">{f.name}</span>
                    <TriggerBadge trigger={f.trigger} />
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {f.nodeCount} steps · {f.runCount} runs · {f.activeSessions} active chats
                    {f.description ? ` · ${f.description}` : ''}
                  </div>
                </div>
                <button onClick={() => startEdit(f.id)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500"><Edit3 size={16} /></button>
                <button onClick={() => remove(f.id)} className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg text-red-400"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// HELPERS
// ============================================================

function TriggerBadge({ trigger }: { trigger: FlowTrigger }) {
  if (trigger.type === 'keyword') return (
    <code className="text-[11px] bg-blue-100 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded font-mono">"{trigger.keyword}" ({trigger.matchType || 'contains'})</code>
  );
  if (trigger.type === 'first_message') return <span className="text-[11px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded">New contact</span>;
  return <span className="text-[11px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded">Any message</span>;
}

/** Convert the ordered node list into the engine graph. Condition nodes carry
 *  explicit yes/no targets (chosen in the editor) → engine edges. */
function buildGraph(nodes: FlowNode[]): { nodes: any[]; edges: any[] } {
  const edges: any[] = [];
  nodes.forEach((n, i) => {
    if (n.type === 'condition') {
      if (n.data.yesTarget) edges.push({ id: `e_${n.id}_y`, source: n.id, target: n.data.yesTarget, sourceHandle: 'yes' });
      if (n.data.noTarget) edges.push({ id: `e_${n.id}_n`, source: n.id, target: n.data.noTarget, sourceHandle: 'no' });
    } else if (n.type === 'jump' || n.type === 'handoff') {
      // terminal/jump — no default edge (jump carries its own targetNodeId)
    } else if (i < nodes.length - 1) {
      edges.push({ id: `e_${n.id}_${nodes[i + 1].id}`, source: n.id, target: nodes[i + 1].id });
    }
  });
  return { nodes: nodes.map((n) => ({ id: n.id, type: n.type, data: n.data, position: { x: 0, y: 0 } })), edges };
}

// ============================================================
// FLOW EDITOR (Stage 1 — ordered list editor)
// ============================================================

const FlowEditor: React.FC<{
  draft: any;
  setDraft: (d: any) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}> = ({ draft, setDraft, onSave, onCancel, saving }) => {
  const update = (patch: any) => setDraft({ ...draft, ...patch });
  const updateNode = (idx: number, patch: any) => {
    const nodes = draft.nodes.map((n: FlowNode, i: number) => (i === idx ? { ...n, data: { ...n.data, ...patch } } : n));
    update({ nodes });
  };
  const setNodeType = (idx: number, type: NodeType) => {
    const nodes = draft.nodes.map((n: FlowNode, i: number) => (i === idx ? { ...n, type, data: {} } : n));
    update({ nodes });
  };
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= draft.nodes.length) return;
    const nodes = [...draft.nodes];
    [nodes[idx], nodes[j]] = [nodes[j], nodes[idx]];
    update({ nodes });
  };
  const removeNode = (idx: number) => {
    if (draft.nodes.length <= 1) return;
    update({ nodes: draft.nodes.filter((_: any, i: number) => i !== idx) });
  };
  const addNode = (type: NodeType) => {
    const n = emptyNode();
    n.type = type;
    if (type === 'message') n.data.text = '';
    if (type === 'question') { n.data.text = ''; n.data.saveAs = 'answer'; }
    if (type === 'delay') n.data.seconds = 5;
    update({ nodes: [...draft.nodes, n] });
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><Zap size={22} className="text-green-600" /> {draft.id ? 'Edit Flow' : 'New Flow'}</h2>
          <div className="flex gap-2">
            <button onClick={onCancel} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"><X size={16} /> Cancel</button>
            <button onClick={onSave} disabled={saving || !draft.name.trim()} className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 disabled:opacity-50">
              {saving ? <Loader size={15} className="animate-spin" /> : <Save size={15} />} Save Flow
            </button>
          </div>
        </div>

        {/* Basics */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4 space-y-3">
          <input value={draft.name} onChange={(e) => update({ name: e.target.value })} placeholder="Flow name (internal) e.g. Pricing Enquiry" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select value={draft.trigger.type} onChange={(e) => update({ trigger: { ...draft.trigger, type: e.target.value } })} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm">
              <option value="keyword">Keyword trigger</option>
              <option value="first_message">First message (new contact)</option>
              <option value="any_message">Any message</option>
            </select>
            {draft.trigger.type === 'keyword' && (
              <>
                <input value={draft.trigger.keyword || ''} onChange={(e) => update({ trigger: { ...draft.trigger, keyword: e.target.value } })} placeholder="Keyword e.g. price" className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm" />
                <select value={draft.matchType} onChange={(e) => update({ matchType: e.target.value })} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm">
                  <option value="contains">Contains</option>
                  <option value="exact">Exact match</option>
                </select>
              </>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs text-gray-500 dark:text-gray-400">Re-entry gap: {draft.reentryHours}h <input type="range" min={0} max={168} value={draft.reentryHours} onChange={(e) => update({ reentryHours: Number(e.target.value) })} className="w-full accent-green-600" /></label>
            <label className="text-xs text-gray-500 dark:text-gray-400">Priority: {draft.priority} <input type="range" min={0} max={10} value={draft.priority} onChange={(e) => update({ priority: Number(e.target.value) })} className="w-full accent-green-600" /></label>
          </div>
        </div>

        {/* Nodes */}
        <div className="space-y-3">
          {draft.nodes.map((node: FlowNode, idx: number) => (
            <React.Fragment key={node.id}>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 text-xs flex items-center justify-center font-bold text-gray-600 dark:text-gray-300">{idx + 1}</span>
                  <span className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 ${NODE_META[node.type].color}`}>{NODE_META[node.type].icon} {NODE_META[node.type].label}</span>
                </div>
                <div className="flex items-center gap-1">
                  <select value={node.type} onChange={(e) => setNodeType(idx, e.target.value as NodeType)} className="text-xs border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                    {Object.entries(NODE_META).map(([t, m]) => <option key={t} value={t}>{m.label}</option>)}
                  </select>
                  <button onClick={() => move(idx, -1)} disabled={idx === 0} className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"><ChevronUp size={14} /></button>
                  <button onClick={() => move(idx, 1)} disabled={idx === draft.nodes.length - 1} className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"><ChevronDown size={14} /></button>
                  <button onClick={() => removeNode(idx)} disabled={draft.nodes.length <= 1} className="p-1.5 text-red-400 hover:text-red-600 disabled:opacity-30"><Trash2 size={14} /></button>
                </div>
              </div>

              {(node.type === 'message' || node.type === 'question') && (
                <div>
                  <textarea rows={2} value={node.data.text || ''} onChange={(e) => updateNode(idx, { text: e.target.value })} placeholder={node.type === 'message' ? 'Message text… {Hi|Hello} {name} — spintax + {name}/{business} supported' : 'Question text… answer saved into variable'} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm" />
                  {node.type === 'question' && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-gray-400">Save answer as:</span>
                      <input value={node.data.saveAs || ''} onChange={(e) => updateNode(idx, { saveAs: e.target.value.replace(/\W/g, '') })} placeholder="budget" className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs w-32" />
                    </div>
                  )}
                </div>
              )}

              {node.type === 'condition' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <select value={node.data.variable || '__message__'} onChange={(e) => updateNode(idx, { variable: e.target.value })} className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-xs">
                      <option value="__message__">Last user message</option>
                      {draft.nodes.filter((n: FlowNode) => n.type === 'question' && n.data.saveAs).map((n: FlowNode) => (
                        <option key={n.id} value={n.data.saveAs}>{n.data.saveAs}</option>
                      ))}
                    </select>
                    <select value={node.data.operator || 'contains'} onChange={(e) => updateNode(idx, { operator: e.target.value })} className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-xs">
                      <option value="contains">contains</option>
                      <option value="equals">equals</option>
                      <option value="not_empty">is not empty</option>
                    </select>
                    {node.data.operator !== 'not_empty' && (
                      <input value={node.data.value || ''} onChange={(e) => updateNode(idx, { value: e.target.value })} placeholder="value e.g. seo" className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-xs" />
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-green-600">YES → step</span>
                      <select value={node.data.yesTarget || ''} onChange={(e) => updateNode(idx, { yesTarget: e.target.value })} className="flex-1 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-xs">
                        <option value="">(end flow)</option>
                        {draft.nodes.map((n: FlowNode, i: number) => i !== idx && <option key={n.id} value={n.id}>Step {i + 1} — {NODE_META[n.type].label}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-red-500">NO → step</span>
                      <select value={node.data.noTarget || ''} onChange={(e) => updateNode(idx, { noTarget: e.target.value })} className="flex-1 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-xs">
                        <option value="">(end flow)</option>
                        {draft.nodes.map((n: FlowNode, i: number) => i !== idx && <option key={n.id} value={n.id}>Step {i + 1} — {NODE_META[n.type].label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {node.type === 'delay' && (
                <div className="flex items-center gap-2">
                  <input type="number" min={0} max={300} value={node.data.seconds ?? 5} onChange={(e) => updateNode(idx, { seconds: Number(e.target.value) })} className="w-20 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm" />
                  <span className="text-sm text-gray-500">seconds wait</span>
                </div>
              )}

              {node.type === 'tag' && (
                <input value={(node.data.tags || []).join(', ')} onChange={(e) => updateNode(idx, { tags: e.target.value.split(',').map((t: string) => t.trim()).filter(Boolean) })} placeholder="tags comma-separated e.g. hot-lead, pricing-ask" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm" />
              )}

              {node.type === 'handoff' && (
                <input value={node.data.notes || ''} onChange={(e) => updateNode(idx, { notes: e.target.value })} placeholder="Note for the human agent (optional)" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm" />
              )}

              {node.type === 'jump' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Jump to step:</span>
                  <select value={node.data.targetNodeId || ''} onChange={(e) => updateNode(idx, { targetNodeId: e.target.value })} className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-xs">
                    <option value="">(end flow)</option>
                    {draft.nodes.map((n: FlowNode, i: number) => i !== idx && <option key={n.id} value={n.id}>Step {i + 1} — {NODE_META[n.type].label}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Connector arrow (skipped after a condition — it branches) */}
            {idx < draft.nodes.length - 1 && node.type !== 'condition' && (
              <div className="flex justify-center text-gray-300 dark:text-gray-600"><ArrowDown size={16} /></div>
            )}
            </React.Fragment>
          ))}
        </div>

        {/* Add node buttons */}
        <div className="flex flex-wrap gap-2 mt-4">
          {Object.entries(NODE_META).map(([t, m]) => (
            <button key={t} onClick={() => addNode(t as NodeType)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-600 dark:text-gray-300 hover:border-green-400 hover:text-green-600">
              <Plus size={12} /> {m.label}
            </button>
          ))}
        </div>

        <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300">
          <CheckCircle size={13} className="inline mr-1" />
          <strong>Live flow:</strong> message steps me spintax <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">{'{Hi|Hello}'}</code> + <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">{'{name}'}</code> auto-apply hota hai, anti-ban delay bhi. Question ke baad contact ka jawab variable me save hota hai jo condition me use hota hai.
        </div>
      </div>
    </div>
  );
};

export default WhatsAppFlowBuilder;
