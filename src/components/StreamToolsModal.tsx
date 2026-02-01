import { useState } from 'react';
import { X, PieChart, Trophy, Plus, Trash2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  broadcasterId: string; // We likely need to pass this or fetch it
}

type ToolTab = 'POLL' | 'PREDICTION';

export const StreamToolsModal = ({ isOpen, onClose, broadcasterId }: Props) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<ToolTab>('POLL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Poll State
  const [pollTitle, setPollTitle] = useState('');
  const [pollChoices, setPollChoices] = useState(['', '']);
  const [pollDuration, setPollDuration] = useState(60);

  // Prediction State
  const [predTitle, setPredTitle] = useState('');
  const [predOutcomes, setPredOutcomes] = useState(['YES', 'NO']);
  const [predWindow, setPredWindow] = useState(60);

  const resetForm = () => {
      setPollTitle('');
      setPollChoices(['', '']);
      setPredTitle('');
      setPredOutcomes(['YES', 'NO']);
      setError('');
      setSuccess('');
      setLoading(false);
  }

  const handleCreatePoll = async () => {
      if (!pollTitle || pollChoices.some(c => !c.trim())) {
          setError('Please fill in all fields.');
          return;
      }
      setLoading(true);
      setError('');
      try {
          await invoke('twitch_create_poll', {
            broadcasterId,
            title: pollTitle,
            choices: pollChoices,
            duration: pollDuration
          });
          setSuccess('Poll created successfully!');
          setTimeout(() => { onClose(); resetForm(); }, 1500);
      } catch (err: any) {
          setError(err.toString());
      } finally {
          setLoading(false);
      }
  };

  const handleCreatePrediction = async () => {
      if (!predTitle || predOutcomes.some(c => !c.trim())) {
          setError('Please fill in all fields.');
          return;
      }
      setLoading(true);
      setError('');
      try {
          await invoke('twitch_create_prediction', {
            broadcasterId,
            title: predTitle,
            outcomes: predOutcomes,
            predictionWindow: predWindow
          });
          setSuccess('Prediction created successfully!');
          setTimeout(() => { onClose(); resetForm(); }, 1500);
      } catch (err: any) {
          setError(err.toString());
      } finally {
          setLoading(false);
      }
  };

  const addChoice = (type: 'poll' | 'pred') => {
      if (type === 'poll' && pollChoices.length < 5) {
          setPollChoices([...pollChoices, '']);
      } else if (type === 'pred' && predOutcomes.length < 10) { // Twitch limit ? usually 2-10
          setPredOutcomes([...predOutcomes, '']);
      }
  };

  const removeChoice = (type: 'poll' | 'pred', idx: number) => {
      if (type === 'poll' && pollChoices.length > 2) {
          setPollChoices(pollChoices.filter((_, i) => i !== idx));
      } else if (type === 'pred' && predOutcomes.length > 2) {
          setPredOutcomes(predOutcomes.filter((_, i) => i !== idx));
      }
  };

  const updateChoice = (type: 'poll' | 'pred', idx: number, val: string) => {
      if (type === 'poll') {
          const newChoices = [...pollChoices];
          newChoices[idx] = val;
          setPollChoices(newChoices);
      } else {
          const newOutcomes = [...predOutcomes];
          newOutcomes[idx] = val;
          setPredOutcomes(newOutcomes);
      }
  };

  return (
    <div className="tools-modal-overlay" onClick={onClose}>
      <div className="tools-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
           <div className="tabs">
               <button 
                className={activeTab === 'POLL' ? 'active' : ''} 
                onClick={() => setActiveTab('POLL')}
               >
                   <PieChart size={16} /> Poll
               </button>
               <button 
                className={activeTab === 'PREDICTION' ? 'active' : ''} 
                onClick={() => setActiveTab('PREDICTION')}
               >
                   <Trophy size={16} /> Prediction
               </button>
           </div>
           <button onClick={onClose} className="close-btn"><X size={18} /></button>
        </div>


            {error && <div className="error-msg">{error}</div>}
            {success && <div className="success-msg">{success}</div>}

            {activeTab === 'POLL' ? (
                <div className="form-content">
                    <div className="field">
                        <label>Poll Title</label>
                        <input 
                            type="text" 
                            placeholder="Ask a question..."
                            value={pollTitle}
                            onChange={e => setPollTitle(e.target.value)}
                        />
                    </div>
                    
                    <div className="field">
                        <label>Choices</label>
                        <div className="choices-container">
                            {pollChoices.map((choice, idx) => (
                                <div key={idx} className="choice-row">
                                    <input 
                                        type="text" 
                                        placeholder={`Option ${idx + 1}`}
                                        value={choice}
                                        onChange={e => updateChoice('poll', idx, e.target.value)}
                                    />
                                    {pollChoices.length > 2 && (
                                        <button className="remove-btn" onClick={() => removeChoice('poll', idx)}>
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            ))}
                            {pollChoices.length < 5 && (
                                <button className="add-btn" onClick={() => addChoice('poll')}>
                                    <Plus size={14} /> Add Option
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="field">
                        <label>Duration</label>
                        <select value={pollDuration} onChange={e => setPollDuration(Number(e.target.value))}>
                            <option value={30}>30 Seconds</option>
                            <option value={60}>1 Minute</option>
                            <option value={120}>2 Minutes</option>
                            <option value={300}>5 Minutes</option>
                        </select>
                    </div>

                    <button className="submit-btn" disabled={loading} onClick={handleCreatePoll}>
                        {loading ? 'Creating...' : 'Start Poll'}
                    </button>
                </div>
            ) : (
                <div className="form-content">
                    <div className="field">
                        <label>Prediction Title</label>
                        <input 
                            type="text" 
                            placeholder="Will I win this game?"
                            value={predTitle}
                            onChange={e => setPredTitle(e.target.value)}
                        />
                    </div>
                    
                    <div className="field">
                        <label>Outcomes</label>
                        <div className="choices-container">
                            {predOutcomes.map((outcome, idx) => (
                                <div key={idx} className="choice-row">
                                    <input 
                                        type="text" 
                                        placeholder={idx === 0 ? 'Blue Outcome' : idx === 1 ? 'Pink Outcome' : `Outcome ${idx + 1}`}
                                        value={outcome}
                                        onChange={e => updateChoice('pred', idx, e.target.value)}
                                        style={{ borderColor: idx === 0 ? '#387aff' : idx === 1 ? '#f5009b' : '#333' }}
                                    />
                                    {predOutcomes.length > 2 && (
                                        <button className="remove-btn" onClick={() => removeChoice('pred', idx)}>
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            ))}
                            {predOutcomes.length < 10 && (
                                <button className="add-btn" onClick={() => addChoice('pred')}>
                                    <Plus size={14} /> Add Outcome
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="field">
                        <label>Prediction Window</label>
                        <select value={predWindow} onChange={e => setPredWindow(Number(e.target.value))}>
                            <option value={30}>30 Seconds</option>
                            <option value={60}>1 Minute</option>
                            <option value={120}>2 Minutes</option>
                            <option value={300}>5 Minutes</option>
                        </select>
                    </div>

                    <button className="submit-btn" disabled={loading} onClick={handleCreatePrediction}>
                        {loading ? 'Creating...' : 'Start Prediction'}
                    </button>
                </div>
            )}
      </div>
      <style>{`
        .tools-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.7);
            backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        }
        .tools-modal {
            background: #18181b;
            border: 1px solid #27272a;
            border-radius: 12px;
            width: 450px;
            box-shadow: 0 20px 50px rgba(0,0,0,0.5);
            display: flex;
            flex-direction: column;
            /* Removed global padding and gap to allow full-width header */
            overflow: hidden; /* Ensure children don't overflow rounded corners */
        }
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 24px;
            /* Removed border-bottom for cleaner look based on user feedback */
            background: #18181b; 
        }
        .tabs {
            display: flex;
            background: #27272a;
            padding: 4px;
            border-radius: 8px;
            gap: 4px;
        }
        .tabs button {
            background: none;
            border: none;
            color: #71717a;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s;
            font-size: 0.85em;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .tabs button:hover {
            color: #e4e4e7;
            background: rgba(255,255,255,0.05);
        }
        .tabs button.active {
            color: #fff;
            background: #52525b;
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }
        .close-btn {
            background: none;
            border: none;
            color: #52525b;
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            transition: all 0.2s;
        }
        .close-btn:hover {
            color: #e4e4e7;
            background: #27272a;
        }
        .form-content {
            display: flex;
            flex-direction: column;
            gap: 20px;
            padding: 0 24px 24px 24px; /* Applied padding directly here */
        }
        .error-msg, .success-msg {
            margin: 0 24px 16px 24px; /* Ensure messages align with content */
        }
        .field {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .field label {
            font-size: 0.85em;
            color: #a1a1aa;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .field input, .field select {
            background: #09090b;
            border: 1px solid #27272a;
            color: #e4e4e7;
            padding: 12px;
            border-radius: 8px;
            outline: none;
            transition: border-color 0.2s;
            font-size: 0.95em;
        }
        .field input:focus, .field select:focus {
            border-color: #9146FF;
        }
        .choices-container {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .choice-row {
            display: flex;
            gap: 10px;
        }
        .choice-row input {
            flex: 1;
        }
        .remove-btn {
            background: transparent;
            border: 1px solid #27272a;
            color: #71717a;
            border-radius: 6px;
            cursor: pointer;
            width: 42px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        }
        .remove-btn:hover {
            border-color: #ef4444;
            color: #ef4444;
            background: rgba(239, 68, 68, 0.05);
        }
        .add-btn {
            background: transparent;
            border: 1px dashed #3f3f46;
            color: #71717a;
            padding: 10px;
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            font-size: 0.9em;
            transition: all 0.2s;
        }
        .add-btn:hover {
            border-color: #71717a;
            color: #e4e4e7;
            background: rgba(255,255,255,0.02);
        }
        .submit-btn {
            margin-top: 8px;
            background: #9146FF;
            color: white;
            border: none;
            padding: 12px;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s;
            font-size: 1em;
        }
        .submit-btn:hover {
            background: #772ce8;
        }
        .submit-btn:disabled {
            opacity: 0.5;
            background: #3f3f46;
            cursor: not-allowed;
        }
        .error-msg {
            background: rgba(239, 68, 68, 0.1);
            color: #fca5a5;
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 16px;
            font-size: 0.9em;
            border: 1px solid rgba(239, 68, 68, 0.2);
        }
        .success-msg {
            background: rgba(34, 197, 94, 0.1);
            color: #86efac;
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 16px;
            font-size: 0.9em;
            border: 1px solid rgba(34, 197, 94, 0.2);
        }
      `}</style>
    </div>
  );
};
