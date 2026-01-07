
import React, { useState, useEffect, useMemo } from 'react';
import { AppStep, Receipt, Person, ReceiptItem, HistoryItem } from './types.ts';
import { COLORS, APP_STORAGE_KEY } from './constants.ts';
import { extractReceiptData } from './geminiService.ts';
import { 
  Plus, 
  Camera, 
  Trash2, 
  UserPlus, 
  Check, 
  ChevronRight, 
  ArrowLeft,
  LifeBuoy,
  History,
  Info
} from 'lucide-react';

const App: React.FC = () => {
  // Navigation State
  const [step, setStep] = useState<AppStep>(AppStep.HISTORY);
  
  // Data State
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persistence
  useEffect(() => {
    try {
      const saved = localStorage.getItem(APP_STORAGE_KEY);
      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Error loading history from storage", e);
    }
  }, []);

  const saveToHistory = (newReceipt: Receipt, participantsCount: number) => {
    const entry: HistoryItem = {
      id: newReceipt.id,
      date: newReceipt.date,
      storeName: newReceipt.storeName,
      total: newReceipt.totalOnTicket,
      participantsCount
    };
    const updatedHistory = [entry, ...history].slice(0, 10);
    setHistory(updatedHistory);
    localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(updatedHistory));
  };

  // Actions
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setStep(AppStep.SCAN);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = (reader.result as string).split(',')[1];
          const data = await extractReceiptData(base64);
          
          const newReceipt: Receipt = {
            id: crypto.randomUUID(),
            date: new Date().toLocaleDateString(),
            storeName: data.storeName || 'Unknown Store',
            currency: data.currency || '$',
            totalOnTicket: data.totalOnTicket || 0,
            items: (data.items || []).map(item => ({
              ...item,
              id: crypto.randomUUID(),
              assignedTo: []
            }))
          };
          
          setReceipt(newReceipt);
          setStep(AppStep.EDIT);
        } catch (err: any) {
          setError(err.message || "Failed to extract data");
          setStep(AppStep.HISTORY);
        } finally {
          setLoading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError("AI Extraction failed.");
      setLoading(false);
      setStep(AppStep.HISTORY);
    }
  };

  const addPerson = (name: string) => {
    if (!name.trim()) return;
    const newPerson: Person = {
      id: crypto.randomUUID(),
      name,
      color: COLORS[people.length % COLORS.length]
    };
    setPeople([...people, newPerson]);
  };

  const removePerson = (id: string) => {
    setPeople(people.filter(p => p.id !== id));
    if (receipt) {
      setReceipt({
        ...receipt,
        items: receipt.items.map(item => ({
          ...item,
          assignedTo: item.assignedTo.filter(pid => pid !== id)
        }))
      });
    }
  };

  const toggleItemAssignment = (itemId: string, personId: string) => {
    if (!receipt) return;
    setReceipt({
      ...receipt,
      items: receipt.items.map(item => {
        if (item.id !== itemId) return item;
        const exists = item.assignedTo.includes(personId);
        return {
          ...item,
          assignedTo: exists 
            ? item.assignedTo.filter(id => id !== personId)
            : [...item.assignedTo, personId]
        };
      })
    });
  };

  const getPersonTotal = (personId: string) => {
    if (!receipt) return 0;
    return receipt.items.reduce((acc, item) => {
      if (item.assignedTo.includes(personId)) {
        return acc + (item.price * item.quantity / item.assignedTo.length);
      }
      return acc;
    }, 0);
  };

  const calculatedTotal = useMemo(() => {
    if (!receipt) return 0;
    return receipt.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  }, [receipt]);

  const rescueAdjustment = () => {
    if (!receipt || !people.length) return;
    const diff = receipt.totalOnTicket - calculatedTotal;
    if (Math.abs(diff) < 0.01) return;

    const updatedItems = [...receipt.items];
    const adjustmentItem: ReceiptItem = {
      id: crypto.randomUUID(),
      name: 'Fee / Tip / Adjustment',
      price: diff,
      quantity: 1,
      assignedTo: people.map(p => p.id)
    };
    setReceipt({ ...receipt, items: [...updatedItems, adjustmentItem] });
  };

  // Rendering Helpers
  const renderHeader = (title: string, onBack?: () => void) => (
    <div className="flex items-center gap-4 px-6 py-8">
      {onBack && (
        <button onClick={onBack} className="p-2 -ml-2 rounded-full bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
      )}
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
    </div>
  );

  const renderBottomNav = (label: string, onClick: () => void, disabled = false) => (
    <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent pointer-events-none">
      <button
        onClick={onClick}
        disabled={disabled}
        className={`pointer-events-auto w-full py-4 rounded-2xl font-bold text-lg indigo-glow flex items-center justify-center gap-2 transition-all active:scale-95 ${
          disabled ? 'bg-slate-800 text-slate-500' : 'bg-indigo-600 text-white hover:bg-indigo-500'
        }`}
      >
        {label} <ChevronRight size={20} />
      </button>
    </div>
  );

  return (
    <div className="min-h-screen pb-32">
      {step === AppStep.HISTORY && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {renderHeader("SplitTicket AI")}
          <div className="px-6 space-y-6">
            {error && <div className="p-4 bg-rose-500/10 border border-rose-500/50 text-rose-500 rounded-2xl text-sm">{error}</div>}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 flex flex-col items-center text-center gap-4 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-indigo-500/20 transition-all"></div>
              <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center indigo-glow">
                <Plus size={32} className="text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold">New Split</h2>
                <p className="text-slate-400 text-sm mt-1">Scan a receipt to start dividing the cost.</p>
              </div>
              <label className="w-full mt-4 cursor-pointer">
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload} />
                <div className="w-full py-4 bg-slate-800 hover:bg-slate-700 transition-colors rounded-2xl font-bold flex items-center justify-center gap-2">
                  <Camera size={20} /> Take Photo
                </div>
              </label>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-slate-400 font-bold uppercase tracking-widest text-xs flex items-center gap-2">
                  <History size={14} /> Recent History
                </h3>
              </div>
              {history.length === 0 ? (
                <div className="py-12 border-2 border-dashed border-slate-800 rounded-3xl flex flex-col items-center text-slate-500 gap-2">
                  <Info size={24} />
                  <p>Your previous splits will appear here</p>
                </div>
              ) : (
                history.map(item => (
                  <div key={item.id} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold">{item.storeName}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">{item.date} • {item.participantsCount} people</p>
                    </div>
                    <div className="text-right">
                      <div className="font-money text-lg text-indigo-400">${item.total.toFixed(2)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center p-12 text-center gap-6">
          <div className="relative">
             <div className="w-20 h-20 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
             <Camera className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-500" size={32} />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black italic">PROCESSING...</h2>
            <p className="text-slate-400">Gemini is reading your receipt and extracting items. Hang tight!</p>
          </div>
        </div>
      )}

      {step === AppStep.EDIT && receipt && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
          {renderHeader("Verify Items", () => setStep(AppStep.HISTORY))}
          <div className="px-6 space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
               <div className="text-xs text-slate-500 uppercase font-bold tracking-widest">Store</div>
               <input 
                value={receipt.storeName}
                onChange={e => setReceipt({...receipt, storeName: e.target.value})}
                className="bg-transparent border-none text-xl font-bold w-full focus:outline-none"
               />
            </div>

            <div className="space-y-3">
              <div className="text-xs text-slate-500 uppercase font-bold tracking-widest px-1">Line Items</div>
              {receipt.items.map((item, idx) => (
                <div key={item.id} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex items-center gap-3">
                  <div className="bg-slate-800 rounded-lg w-10 h-10 flex items-center justify-center font-bold text-slate-400">
                    {item.quantity}x
                  </div>
                  <div className="flex-1">
                    <input 
                      className="bg-transparent font-bold w-full focus:outline-none"
                      value={item.name}
                      onChange={e => {
                        const newItems = [...receipt.items];
                        newItems[idx].name = e.target.value;
                        setReceipt({...receipt, items: newItems});
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-1 text-emerald-400 font-money">
                    <span>{receipt.currency}</span>
                    <input 
                      type="number"
                      className="bg-transparent w-20 text-right focus:outline-none"
                      value={item.price}
                      onChange={e => {
                        const newItems = [...receipt.items];
                        newItems[idx].price = parseFloat(e.target.value) || 0;
                        setReceipt({...receipt, items: newItems});
                      }}
                    />
                  </div>
                  <button 
                    onClick={() => {
                      const newItems = receipt.items.filter((_, i) => i !== idx);
                      setReceipt({...receipt, items: newItems});
                    }}
                    className="text-slate-600 hover:text-rose-500"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>
          {renderBottomNav("Next: Who's Paying?", () => setStep(AppStep.PEOPLE))}
        </div>
      )}

      {step === AppStep.PEOPLE && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300 px-6">
          {renderHeader("The Crew", () => setStep(AppStep.EDIT))}
          <div className="space-y-6">
            <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-3xl p-6 flex items-center gap-4">
              <UserPlus className="text-indigo-500 shrink-0" size={32} />
              <input 
                placeholder="Enter a name..."
                className="bg-transparent border-none text-xl font-bold w-full placeholder:text-slate-700 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    addPerson(e.currentTarget.value);
                    e.currentTarget.value = '';
                  }
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {people.map(person => (
                <div key={person.id} className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center justify-between group">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className={`w-8 h-8 rounded-full ${person.color} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                      {person.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-bold truncate">{person.name}</span>
                  </div>
                  <button onClick={() => removePerson(person.id)} className="text-slate-600 hover:text-rose-500 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
          {renderBottomNav("Let's Split!", () => setStep(AppStep.SPLIT), people.length === 0)}
        </div>
      )}

      {step === AppStep.SPLIT && receipt && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300 h-full">
          {renderHeader("Split Assignment", () => setStep(AppStep.PEOPLE))}
          <div className="px-4 space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-4 px-2 no-scrollbar snap-x">
              {people.map(person => (
                <div key={person.id} className="snap-center flex flex-col items-center gap-2 min-w-[80px]">
                  <div className={`w-12 h-12 rounded-full ${person.color} flex items-center justify-center text-white font-bold indigo-glow`}>
                    {person.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs font-bold text-slate-400">{person.name}</span>
                  <div className="font-money text-indigo-400 text-sm">{receipt.currency}{getPersonTotal(person.id).toFixed(2)}</div>
                </div>
              ))}
            </div>
            <div className="space-y-4">
              {receipt.items.map(item => (
                <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
                  <div className="flex justify-between items-start">
                    <h4 className="font-bold text-lg leading-tight">{item.name}</h4>
                    <div className="text-right">
                      <div className="font-money text-xl">{receipt.currency}{(item.price * item.quantity).toFixed(2)}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {people.map(person => {
                      const active = item.assignedTo.includes(person.id);
                      return (
                        <button 
                          key={person.id}
                          onClick={() => toggleItemAssignment(item.id, person.id)}
                          className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all border ${
                            active 
                            ? `${person.color} text-white border-transparent scale-105 indigo-glow` 
                            : 'bg-slate-800 text-slate-500 border-slate-700'
                          }`}
                        >
                          {person.name}
                          {active && <Check size={14} />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {renderBottomNav("Show Summary", () => setStep(AppStep.SUMMARY))}
        </div>
      )}

      {step === AppStep.SUMMARY && receipt && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-40 px-6 space-y-6">
          {renderHeader("The Receipt", () => setStep(AppStep.SPLIT))}
          <div className="bg-white text-slate-900 rounded-t-3xl p-8 relative receipt-mask shadow-2xl">
            <div className="text-center space-y-1 mb-8">
              <h2 className="text-3xl font-black italic">{receipt.storeName.toUpperCase()}</h2>
              <div className="text-slate-400 text-sm">{receipt.date}</div>
            </div>
            <div className="space-y-6 border-t border-b border-slate-100 py-8">
              {people.map(person => {
                const total = getPersonTotal(person.id);
                if (total === 0) return null;
                return (
                  <div key={person.id} className="flex justify-between items-end">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${person.color}`}></div>
                      <span className="font-bold text-xl leading-none">{person.name}</span>
                    </div>
                    <div className="text-2xl font-money tracking-tighter">{receipt.currency}{total.toFixed(2)}</div>
                  </div>
                );
              })}
            </div>
            <div className="pt-8 space-y-4 text-slate-400 uppercase font-bold text-xs tracking-widest">
              <div className="flex justify-between items-center">
                <span>Ticket Total</span>
                <span>{receipt.currency}{receipt.totalOnTicket.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Assigned Sum</span>
                <span>{receipt.currency}{calculatedTotal.toFixed(2)}</span>
              </div>
              {Math.abs(receipt.totalOnTicket - calculatedTotal) > 0.01 && (
                <div className="bg-amber-50 rounded-2xl p-4 flex items-center justify-between gap-4">
                  <div className="text-amber-600 font-bold text-sm">Discrepancy: {receipt.currency}{(receipt.totalOnTicket - calculatedTotal).toFixed(2)}</div>
                  <button onClick={rescueAdjustment} className="bg-amber-500 text-white px-4 py-3 rounded-xl font-bold flex items-center gap-2"><LifeBuoy size={18} /> Rescue</button>
                </div>
              )}
            </div>
          </div>
          <button onClick={() => { saveToHistory(receipt, people.length); setStep(AppStep.HISTORY); }} className="w-full py-5 bg-indigo-600 text-white rounded-3xl font-black text-xl italic tracking-tight indigo-glow">FINALIZE & SAVE</button>
        </div>
      )}
    </div>
  );
};

export default App;
