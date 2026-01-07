
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
  Info,
  Sparkles,
  Users,
  Wallet,
  AlertCircle,
  MessageCircle,
  CheckCircle2
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
            currency: data.currency || '€',
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
          setError(err.message || "Error al extraer datos");
          setStep(AppStep.HISTORY);
        } finally {
          setLoading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError("Fallo en la extracción IA.");
      setLoading(false);
      setStep(AppStep.HISTORY);
    }
  };

  const addPerson = (name: string) => {
    if (!name.trim()) return;
    const newPerson: Person = {
      id: crypto.randomUUID(),
      name,
      color: COLORS[people.length % COLORS.length],
      paid: false
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

  const togglePaid = (personId: string) => {
    setPeople(people.map(p => p.id === personId ? { ...p, paid: !p.paid } : p));
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

  const assignAllToItem = (itemId: string) => {
    if (!receipt) return;
    const allPersonIds = people.map(p => p.id);
    setReceipt({
      ...receipt,
      items: receipt.items.map(item => {
        if (item.id !== itemId) return item;
        const isAllAssigned = allPersonIds.every(id => item.assignedTo.includes(id));
        return {
          ...item,
          assignedTo: isAllAssigned ? [] : allPersonIds
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

  const shareByWhatsApp = (person: Person) => {
    if (!receipt) return;
    const total = getPersonTotal(person.id);
    const assignedItems = receipt.items.filter(item => item.assignedTo.includes(person.id));
    
    let message = `*Resumen de cuenta - ${receipt.storeName}*\n\n`;
    message += `Hola ${person.name}, aquí tienes tu parte:\n`;
    
    assignedItems.forEach(item => {
      const individualPrice = (item.price * item.quantity / item.assignedTo.length).toFixed(2);
      message += `• ${item.name}: ${receipt.currency}${individualPrice}\n`;
    });
    
    message += `\n*TOTAL A PAGAR: ${receipt.currency}${total.toFixed(2)}*`;
    
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
  };

  // Suma real de lo que la gente está pagando ahora mismo
  const totalPaidByPeople = useMemo(() => {
    return people.reduce((acc, p) => acc + getPersonTotal(p.id), 0);
  }, [receipt, people]);

  const rescueAdjustment = () => {
    if (!receipt || !people.length) return;
    const diff = receipt.totalOnTicket - totalPaidByPeople;
    if (Math.abs(diff) < 0.01) return;

    const updatedItems = [...receipt.items];
    const adjustmentItem: ReceiptItem = {
      id: crypto.randomUUID(),
      name: 'IVA / Diferencia',
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

  return (
    <div className="min-h-screen pb-12">
      {step === AppStep.HISTORY && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {renderHeader("SplitTicket AI")}
          <div className="px-6 space-y-6">
            {error && <div className="p-4 bg-rose-500/10 border border-rose-500/50 text-rose-500 rounded-2xl text-sm">{error}</div>}
            <label className="block bg-slate-900 border border-slate-800 rounded-3xl p-8 flex flex-col items-center text-center gap-4 relative overflow-hidden group active:scale-[0.98] transition-transform cursor-pointer">
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload} />
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-indigo-500/20 transition-all"></div>
              <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center indigo-glow relative">
                <Plus size={32} className="text-white group-hover:scale-110 transition-transform" />
                <div className="absolute -bottom-1 -right-1 bg-emerald-500 rounded-full p-1 border-2 border-slate-900">
                  <Sparkles size={10} className="text-white" />
                </div>
              </div>
              <div>
                <h2 className="text-xl font-bold">Nuevo Split</h2>
                <p className="text-slate-400 text-sm mt-1">Toca aquí para escanear un ticket con IA</p>
              </div>
              <div className="w-full py-4 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-all rounded-2xl font-bold flex items-center justify-center gap-2 mt-2">
                <Camera size={20} /> Hacer Foto
              </div>
            </label>

            <div className="space-y-4">
              <div className="flex items-center justify-between px-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                <div className="flex items-center gap-2"><History size={12} /> Historial</div>
              </div>
              {history.length === 0 ? (
                <div className="py-12 border border-slate-800 rounded-3xl flex flex-col items-center text-slate-500 gap-2 bg-slate-900/20">
                  <Info size={24} />
                  <p className="text-sm">Tus splits anteriores aparecerán aquí</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map(item => (
                    <div key={item.id} className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-4 flex items-center justify-between">
                      <div className="space-y-1">
                        <h4 className="font-bold text-slate-100">{item.storeName}</h4>
                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase">
                          <span>{item.date}</span>
                          <span className="w-1 h-1 bg-slate-700 rounded-full"></span>
                          <span>{item.participantsCount} personas</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-money text-lg text-indigo-400">€{item.total.toFixed(2)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xl flex flex-col items-center justify-center p-12 text-center gap-6">
          <div className="relative">
             <div className="w-24 h-24 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
             <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-400" size={32} />
          </div>
          <h2 className="text-2xl font-black italic text-white tracking-tight text-center uppercase">Procesando Ticket...</h2>
          <p className="text-slate-400 text-sm leading-relaxed max-w-xs">Gemini está analizando los artículos, precios y cantidades automáticamente.</p>
        </div>
      )}

      {step === AppStep.EDIT && receipt && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
          {renderHeader("Verificar Items", () => setStep(AppStep.HISTORY))}
          <div className="px-6 space-y-4 pb-24">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
               <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1 text-slate-400">Nombre del Local</div>
               <input 
                value={receipt.storeName}
                onChange={e => setReceipt({...receipt, storeName: e.target.value})}
                className="bg-transparent border-none text-xl font-bold w-full focus:outline-none text-slate-100"
               />
            </div>
            <div className="space-y-3">
              {receipt.items.map((item, idx) => (
                <div key={item.id} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex items-center gap-3">
                  <input 
                    type="number"
                    className="bg-slate-800 rounded-xl w-12 h-10 text-center font-black text-slate-100 text-sm focus:outline-none"
                    value={item.quantity}
                    onChange={e => {
                      const newItems = [...receipt.items];
                      newItems[idx].quantity = parseInt(e.target.value) || 0;
                      setReceipt({...receipt, items: newItems});
                    }}
                  />
                  <div className="flex-1">
                    <input 
                      className="bg-transparent font-bold w-full focus:outline-none text-slate-200"
                      value={item.name}
                      onChange={e => {
                        const newItems = [...receipt.items];
                        newItems[idx].name = e.target.value;
                        setReceipt({...receipt, items: newItems});
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-1 text-emerald-400 font-money">
                    <span className="text-xs opacity-50">{receipt.currency}</span>
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
                  <button onClick={() => setReceipt({...receipt, items: receipt.items.filter((_, i) => i !== idx)})} className="text-slate-600 hover:text-rose-500 p-2">
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
              <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-4 flex justify-between items-center">
                 <span className="text-xs font-bold text-slate-500 uppercase">Total Ticket</span>
                 <div className="flex items-center gap-1 font-money text-white text-xl">
                   <span>{receipt.currency}</span>
                   <input 
                    type="number" 
                    className="bg-transparent w-24 text-right focus:outline-none"
                    value={receipt.totalOnTicket}
                    onChange={e => setReceipt({...receipt, totalOnTicket: parseFloat(e.target.value) || 0})}
                   />
                 </div>
              </div>
            </div>
          </div>
          <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-slate-950 to-transparent">
            <button
              onClick={() => setStep(AppStep.PEOPLE)}
              className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-bold text-lg indigo-glow flex items-center justify-center gap-2"
            >
              Continuar <ChevronRight size={20} />
            </button>
          </div>
        </div>
      )}

      {step === AppStep.PEOPLE && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300 px-6">
          {renderHeader("Participantes", () => setStep(AppStep.EDIT))}
          <div className="space-y-6">
            <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-3xl p-6 flex items-center gap-4">
              <UserPlus className="text-indigo-500 shrink-0" size={32} />
              <input 
                placeholder="Nombre de la persona..."
                className="bg-transparent border-none text-xl font-bold w-full placeholder:text-slate-700 focus:outline-none text-white"
                autoFocus
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
                <div key={person.id} className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className={`w-8 h-8 rounded-full ${person.color} flex items-center justify-center text-white text-xs font-black shrink-0`}>
                      {person.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-bold truncate text-slate-200">{person.name}</span>
                  </div>
                  <button onClick={() => removePerson(person.id)} className="text-slate-600 hover:text-rose-500 p-1">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-slate-950 to-transparent">
            <button
              onClick={() => setStep(AppStep.SPLIT)}
              disabled={people.length === 0}
              className={`w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 ${people.length === 0 ? 'bg-slate-800 text-slate-500' : 'bg-indigo-600 text-white indigo-glow'}`}
            >
              Empezar Split <ChevronRight size={20} />
            </button>
          </div>
        </div>
      )}

      {step === AppStep.SPLIT && receipt && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300 flex flex-col">
          {renderHeader("Repartir Cuenta", () => setStep(AppStep.PEOPLE))}
          <div className="px-4 space-y-4 pb-32">
            <div className="flex gap-2 overflow-x-auto pb-4 px-2 no-scrollbar snap-x sticky top-0 bg-slate-950 z-20 py-2">
              {people.map(person => (
                <div key={person.id} className="snap-center flex flex-col items-center gap-2 min-w-[100px] bg-slate-900 border border-slate-800 p-3 rounded-2xl">
                  <div className={`w-10 h-10 rounded-full ${person.color} flex items-center justify-center text-white font-black text-sm`}>
                    {person.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter truncate w-full text-center">{person.name}</span>
                  <div className="font-money text-indigo-400 text-xs">{receipt.currency}{getPersonTotal(person.id).toFixed(2)}</div>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              {receipt.items.map(item => {
                const isUnassigned = item.assignedTo.length === 0;
                return (
                  <div key={item.id} className={`bg-slate-900 border rounded-3xl p-5 space-y-4 transition-all ${isUnassigned ? 'border-amber-500/30 ring-1 ring-amber-500/10' : 'border-slate-800'}`}>
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-lg leading-tight text-slate-100">{item.name}</h4>
                          {isUnassigned && <AlertCircle size={14} className="text-amber-500" />}
                        </div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                          Consumidos: <span className="text-indigo-400">{item.quantity}</span>
                        </span>
                      </div>
                      <div className="text-right flex flex-col items-end gap-1">
                        <div className="font-money text-xl text-emerald-400">{receipt.currency}{(item.price * item.quantity).toFixed(2)}</div>
                        <button 
                          onClick={() => assignAllToItem(item.id)}
                          className="text-[9px] font-black uppercase text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded-md border border-indigo-500/30 flex items-center gap-1"
                        >
                          <Users size={10} /> Todos
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800">
                      {people.map(person => {
                        const active = item.assignedTo.includes(person.id);
                        return (
                          <button 
                            key={person.id}
                            onClick={() => toggleItemAssignment(item.id, person.id)}
                            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all border ${
                              active 
                              ? `${person.color} text-white border-transparent scale-105 shadow-lg` 
                              : 'bg-slate-800 text-slate-500 border-slate-700'
                            }`}
                          >
                            {person.name}
                            {active && <Check size={12} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-slate-950 to-transparent">
            <button
              onClick={() => setStep(AppStep.SUMMARY)}
              className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-bold text-lg indigo-glow flex items-center justify-center gap-2"
            >
              Ver Resumen <ChevronRight size={20} />
            </button>
          </div>
        </div>
      )}

      {step === AppStep.SUMMARY && receipt && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20 px-6 flex flex-col">
          {renderHeader("Resumen Final", () => setStep(AppStep.SPLIT))}
          
          <div className="bg-white text-slate-900 rounded-3xl shadow-2xl relative overflow-hidden flex flex-col">
            <div className="p-8 pb-4 text-center border-b border-dashed border-slate-200">
               <h2 className="text-3xl font-black italic tracking-tighter uppercase leading-none">{receipt.storeName}</h2>
               <div className="text-slate-400 text-[10px] font-bold mt-2 uppercase tracking-widest">{receipt.date}</div>
            </div>

            <div className="px-8 py-6 space-y-6 flex-1">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Reparto por Persona</div>
              {people.map(person => {
                const total = getPersonTotal(person.id);
                if (total === 0) return null;
                return (
                  <div key={person.id} className="flex flex-col gap-2 border-b border-slate-50 pb-4 last:border-0">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => togglePaid(person.id)}
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${person.paid ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-300'}`}
                        >
                          <CheckCircle2 size={18} />
                        </button>
                        <div className="flex flex-col">
                          <span className={`font-bold text-lg transition-all ${person.paid ? 'text-slate-300 line-through decoration-emerald-500 decoration-2' : 'text-slate-800'}`}>
                            {person.name}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className={`text-2xl font-money tracking-tighter transition-all ${person.paid ? 'text-slate-300' : 'text-indigo-600'}`}>
                          <span className="text-sm opacity-50 mr-0.5">{receipt.currency}</span>
                          {total.toFixed(2)}
                        </div>
                        <button 
                          onClick={() => shareByWhatsApp(person)}
                          className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                        >
                          <MessageCircle size={20} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-8 py-8 bg-slate-50 mt-auto relative">
              <div className="absolute top-0 left-0 right-0 h-2 flex overflow-hidden -translate-y-full opacity-10">
                {[...Array(20)].map((_, i) => (
                  <div key={i} className="w-4 h-4 bg-slate-900 rotate-45 -translate-y-1/2 shrink-0"></div>
                ))}
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center text-slate-400 uppercase font-bold text-[10px] tracking-widest">
                  <span>Asignado a Personas</span>
                  <span className="text-slate-600">{receipt.currency}{totalPaidByPeople.toFixed(2)}</span>
                </div>
                
                {Math.abs(receipt.totalOnTicket - totalPaidByPeople) > 0.01 && (
                  <div className="flex flex-col gap-3 p-4 bg-indigo-600 text-white rounded-2xl shadow-lg animate-pulse">
                    <div className="flex justify-between items-center uppercase font-black text-xs">
                      <span>IVA / DIFERENCIA</span>
                      <span>{receipt.currency}{(receipt.totalOnTicket - totalPaidByPeople).toFixed(2)}</span>
                    </div>
                    <button 
                      onClick={rescueAdjustment} 
                      className="w-full bg-white text-indigo-600 py-3 rounded-xl font-black text-xs flex items-center justify-center gap-2"
                    >
                      <LifeBuoy size={16} /> REPARTIR IVA ENTRE TODOS
                    </button>
                  </div>
                )}

                <div className="pt-3 border-t-2 border-slate-200 flex justify-between items-end">
                   <div className="flex flex-col">
                      <div className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em]">TOTAL TICKET</div>
                   </div>
                   <div className="text-4xl font-money tracking-tighter text-slate-900 leading-none">
                     <span className="text-xl mr-1">{receipt.currency}</span>
                     {receipt.totalOnTicket.toFixed(2)}
                   </div>
                </div>
              </div>
            </div>

            <div className="h-4 flex overflow-hidden bg-white">
              {[...Array(30)].map((_, i) => (
                <div key={i} className="w-4 h-4 bg-slate-950 rotate-45 translate-y-1/2 shrink-0"></div>
              ))}
            </div>
          </div>

          <div className="mt-8 space-y-4">
            <button 
              onClick={() => { 
                saveToHistory(receipt, people.length); 
                setStep(AppStep.HISTORY); 
              }} 
              className="w-full py-5 bg-indigo-600 text-white rounded-3xl font-black text-xl italic tracking-tight indigo-glow shadow-xl"
            >
              FINALIZAR Y GUARDAR
            </button>
            <button 
              onClick={() => setStep(AppStep.SPLIT)}
              className="w-full py-2 text-slate-500 font-bold uppercase tracking-widest text-[10px]"
            >
              Revisar Asignaciones
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
