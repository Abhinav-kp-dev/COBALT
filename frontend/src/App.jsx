import { useState, useEffect } from 'react';
import { Upload, FileText, Map as MapIcon, Box, Activity, CheckCircle, AlertTriangle, Layers, FileOutput, Globe, Trash2, CheckSquare, Square, X } from 'lucide-react';
import { uploadFile, fetchHistory, deleteInspection, deleteInspections } from './api';

function App() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [history, setHistory] = useState([]);
  
  // DATE PICKER STATE
  const [startDate, setStartDate] = useState("2024-01-01");
  const [endDate, setEndDate] = useState("2024-04-30");

  // NEW: State to control which view is active (3D, 2D, or PDF)
  const [activeView, setActiveView] = useState('3d');

  // Inspection log selection. selectMode swaps the list into a checkbox list so
  // several runs can be cleared at once; selectedIds holds the ticked rows.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const data = await fetchHistory();
      // Automatically select the most recent report if available
      if (data) {
        setHistory(data);
        // Drop any ticked ids that no longer exist, so the delete button
        // cannot fire against rows that are already gone.
        setSelectedIds((prev) => prev.filter((id) => data.some((d) => d.id === id)));
      }
    } catch (error) {
      console.error("Failed to load history", error);
    }
  };

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setLoading(true);
    setReport(null);
    
    try {
      // Pass dates to upload function (threshold-based detection is the only method)
      const result = await uploadFile(file, startDate, endDate);
      setReport(result);
      loadHistory(); 
    } catch (error) {
      alert("Analysis Failed: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelectMode = () => {
    setSelectMode((on) => !on);
    setSelectedIds([]);
  };

  const toggleSelected = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const allSelected = history.length > 0 && selectedIds.length === history.length;

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : history.map((h) => h.id));
  };

  // If the currently open report was one of the deleted rows, clear the viewer
  // rather than leaving it pointing at artifacts the backend just removed.
  const clearReportIfDeleted = (deletedJobIds) => {
    if (report && deletedJobIds.includes(report.job_id)) setReport(null);
  };

  const handleDeleteOne = async (item, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete the inspection for "${item.filename}"? This also removes its report, map and 3D model.`)) return;
    setDeleting(true);
    try {
      await deleteInspection(item.id);
      clearReportIfDeleted([item.job_id]);
      await loadHistory();
    } catch (error) {
      alert("Delete failed: " + (error?.response?.data?.detail || error.message));
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    const n = selectedIds.length;
    if (!window.confirm(`Delete ${n} inspection${n > 1 ? "s" : ""}? This also removes their reports, maps and 3D models.`)) return;
    const jobIds = history.filter((h) => selectedIds.includes(h.id)).map((h) => h.job_id);
    setDeleting(true);
    try {
      await deleteInspections(selectedIds);
      clearReportIfDeleted(jobIds);
      setSelectedIds([]);
      setSelectMode(false);
      await loadHistory();
    } catch (error) {
      alert("Delete failed: " + (error?.response?.data?.detail || error.message));
    } finally {
      setDeleting(false);
    }
  };

  // Allow clicking a history item to load it into the main view
  const loadFromHistory = (item) => {
    // Reconstruct the report object from the history item
    setReport({
      status: "success", // History items are always completed
      job_id: item.job_id,
      metrics: {
        illegal_area_m2: item.illegal_area_m2,
        volume_m3: item.volume_m3,
        avg_depth_m: item.avg_depth_m,
        truckloads: item.truckloads
      },
      urls: {
        report: item.report_url,
        map: item.map_url,
        '3d_model': item.model_url
      }
    });
  };

  // Helper to safely access metrics
  const metrics = report?.metrics || {};
  const urls = report?.urls || {};

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-[1600px] mx-auto font-sans text-slate-200">
      
      {/* HEADER */}
      <header className="flex items-center justify-between mb-8 border-b border-slate-700 pb-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            MineGuard Enterprise
          </h1>
          <p className="text-slate-400 text-xs tracking-wider uppercase">Geospatial Intelligence Platform v2.0</p>
        </div>
        <div className="flex items-center gap-2 text-green-400 text-xs font-bold bg-green-900/30 px-3 py-1 rounded-full border border-green-800">
          <Activity size={14} /> SYSTEM ONLINE
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT SIDEBAR (3 Columns) */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* UPLOAD PANEL */}
          <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700 backdrop-blur-sm">
            <h2 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2 uppercase tracking-wide">
              <Upload size={16} className="text-cyan-400"/> New Analysis
            </h2>
            
            {/* FILE DROP ZONE */}
            <div className="border-2 border-dashed border-slate-600 rounded-lg p-6 text-center hover:border-cyan-500 hover:bg-slate-800 transition-all group">
              <input type="file" onChange={handleFileChange} className="hidden" id="fileInput" />
              <label htmlFor="fileInput" className="cursor-pointer flex flex-col items-center">
                <FileText size={32} className="text-slate-500 group-hover:text-cyan-400 mb-2 transition-colors" />
                <span className="text-xs text-slate-400">
                  {file ? <span className="text-cyan-400 font-bold">{file.name}</span> : "Drag KML/Shapefile here"}
                </span>
              </label>
            </div>

            {/* --- DATE PICKER SECTION (ADDED HERE) --- */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-400 font-medium ml-1">Start Date</label>
                <input 
                  type="date" 
                  value={startDate} 
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-medium ml-1">End Date</label>
                <input 
                  type="date" 
                  value={endDate} 
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              onClick={handleAnalyze}
              disabled={!file || loading}
              className={`w-full mt-4 py-3 rounded-lg font-bold text-white text-sm transition-all shadow-lg
                ${loading ? 'bg-slate-600 cursor-wait' : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 shadow-cyan-900/20'}
              `}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> Processing...
                </span>
              ) : "RUN DETECTION"}
            </button>
          </div>

          {/* HISTORY LIST */}
          <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700 h-[600px] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 uppercase tracking-wide">
                <Layers size={16} className="text-purple-400"/> Inspection Log
              </h3>
              {history.length > 0 && (
                <button
                  onClick={toggleSelectMode}
                  className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded border transition-colors
                    ${selectMode
                      ? 'border-slate-600 text-slate-300 hover:bg-slate-700/50'
                      : 'border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500'}`}
                  title={selectMode ? "Leave selection mode" : "Select entries to delete"}
                >
                  {selectMode ? <span className="flex items-center gap-1"><X size={11}/> Cancel</span> : "Select"}
                </button>
              )}
            </div>

            {/* SELECTION ACTION BAR */}
            {selectMode && (
              <div className="flex items-center justify-between gap-2 mb-3 px-2 py-2 rounded-lg bg-slate-900/70 border border-slate-700">
                <button
                  onClick={toggleSelectAll}
                  className="text-[11px] text-slate-300 hover:text-cyan-300 flex items-center gap-1.5"
                >
                  {allSelected ? <CheckSquare size={13} className="text-cyan-400"/> : <Square size={13}/>}
                  {allSelected ? "Clear all" : "Select all"}
                </button>
                <span className="text-[10px] text-slate-500">{selectedIds.length} selected</span>
                <button
                  onClick={handleDeleteSelected}
                  disabled={selectedIds.length === 0 || deleting}
                  className="text-[11px] font-bold px-2.5 py-1 rounded flex items-center gap-1.5 transition-colors
                    bg-red-900/40 text-red-300 border border-red-800/70 hover:bg-red-800/60
                    disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-red-900/40"
                >
                  <Trash2 size={12}/> {deleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            )}
            <div className="overflow-y-auto pr-2 space-y-2 flex-1 custom-scrollbar">
              {history.length === 0 && (
                <p className="text-xs text-slate-500 italic px-1">No inspections yet.</p>
              )}
              {history.map((item) => {
                const isChecked = selectedIds.includes(item.id);
                return (
                <div 
                  key={item.id} 
                  onClick={() => (selectMode ? toggleSelected(item.id) : loadFromHistory(item))}
                  className={`group relative p-3 rounded-lg border cursor-pointer transition-all hover:translate-x-1
                    ${selectMode && isChecked
                      ? 'bg-red-900/20 border-red-500/50'
                      : report && report.job_id === item.job_id 
                        ? 'bg-blue-900/30 border-blue-500/50' 
                        : 'bg-slate-900/50 border-slate-700 hover:border-slate-600'}
                  `}
                >
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="font-medium text-xs text-slate-200 truncate flex items-center gap-2 w-32" title={item.filename}>
                      {selectMode && (
                        isChecked
                          ? <CheckSquare size={13} className="text-red-400 shrink-0"/>
                          : <Square size={13} className="text-slate-500 shrink-0"/>
                      )}
                      <span className="truncate">{item.filename}</span>
                    </h4>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold
                      ${item.illegal_area_m2 > 0 ? "bg-red-900/50 text-red-400" : "bg-green-900/50 text-green-400"}
                    `}>
                      {item.illegal_area_m2 > 0 ? "REVIEW" : "CLEAR"}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 flex justify-between items-center">
                    <span>{new Date(item.created_at).toLocaleDateString()}</span>
                    <span className="flex items-center gap-2">
                      <span>Vol: {item.volume_m3 ? Math.round(item.volume_m3).toLocaleString() : 0} m³</span>
                      {!selectMode && (
                        <button
                          onClick={(e) => handleDeleteOne(item, e)}
                          disabled={deleting}
                          title="Delete this inspection"
                          className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-slate-500 hover:text-red-400 transition-opacity disabled:opacity-30"
                        >
                          <Trash2 size={12}/>
                        </button>
                      )}
                    </span>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* MAIN DISPLAY (9 Columns) */}
        <div className="lg:col-span-9 space-y-6">
          
          {report ? (
            <>
              {/* METRICS ROW */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Boundary Deviation Area", val: `${metrics.illegal_area_m2?.toLocaleString() || 0} m²`, icon: MapIcon, color: "text-orange-400" },
                  { label: "Extracted Volume", val: `${metrics.volume_m3?.toLocaleString() || 0} m³`, icon: Box, color: "text-cyan-400" },
                  { label: "Avg. Pit Depth", val: `${metrics.avg_depth_m?.toFixed(2) || 0} m`, icon: Activity, color: "text-purple-400" },
                  { label: "Estimated Truckloads", val: metrics.truckloads?.toLocaleString() || 0, icon: AlertTriangle, color: "text-red-400" },
                ].map((stat, i) => (
                  <div key={i} className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 backdrop-blur-sm">
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`p-2 rounded-lg bg-slate-900 ${stat.color}`}>
                        <stat.icon size={18} />
                      </div>
                      <p className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">{stat.label}</p>
                    </div>
                    <p className="text-2xl font-bold text-white pl-1">{stat.val}</p>
                  </div>
                ))}
              </div>

              {/* MAIN VISUALIZATION WINDOW */}
              <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-700 shadow-2xl h-[650px] flex flex-col">
                
                {/* View Switcher Tabs */}
                <div className="flex items-center border-b border-slate-700 bg-slate-800/80">
                  <button 
                    onClick={() => setActiveView('3d')}
                    className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all border-b-2
                      ${activeView === '3d' ? 'border-cyan-400 text-cyan-400 bg-cyan-900/10' : 'border-transparent text-slate-400 hover:text-slate-200'}
                    `}
                  >
                    <Box size={16} /> 3D FORENSICS
                  </button>
                  <button 
                    onClick={() => setActiveView('2d')}
                    className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all border-b-2
                      ${activeView === '2d' ? 'border-orange-400 text-orange-400 bg-orange-900/10' : 'border-transparent text-slate-400 hover:text-slate-200'}
                    `}
                  >
                    <Globe size={16} /> SATELLITE MAP
                  </button>
                  <button 
                    onClick={() => setActiveView('pdf')}
                    className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all border-b-2
                      ${activeView === 'pdf' ? 'border-purple-400 text-purple-400 bg-purple-900/10' : 'border-transparent text-slate-400 hover:text-slate-200'}
                    `}
                  >
                    <FileOutput size={16} /> OFFICIAL REPORT
                  </button>
                  
                  <div className="ml-auto pr-4">
                    {/* Status Badge */}
                    <span className={`px-3 py-1 rounded text-xs font-bold border
                      ${metrics.illegal_area_m2 > 0 
                        ? 'bg-red-500/10 border-red-500 text-red-400' 
                        : 'bg-green-500/10 border-green-500 text-green-400'}
                    `}>
                      {metrics.illegal_area_m2 > 0 ? "REQUIRES REVIEW" : "WITHIN LEASE"}
                    </span>
                  </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 bg-black relative">
                  {/* VIEW: 3D MODEL */}
                  {activeView === '3d' && (
                    urls['3d_model'] ? (
                      <iframe 
                        src={urls['3d_model']} 
                        className="w-full h-full border-0"
                        title="3D Model"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-slate-500">
                        <Box size={48} className="mb-4 opacity-50"/>
                        <p>No 3D Model Available (Zero Volume detected)</p>
                      </div>
                    )
                  )}

                  {/* VIEW: 2D MAP */}
                  {activeView === '2d' && (
                    <iframe 
                      src={urls.map} 
                      className="w-full h-full border-0 bg-slate-900"
                      title="Satellite Map"
                    />
                  )}

                  {/* VIEW: PDF REPORT */}
                  {activeView === 'pdf' && (
                    <iframe 
                      src={urls.report} 
                      className="w-full h-full border-0 bg-slate-200"
                      title="PDF Report"
                    />
                  )}
                </div>
              </div>

            </>
          ) : (
            // EMPTY STATE PLACEHOLDER
            <div className="h-full flex flex-col items-center justify-center text-slate-600 border-2 border-dashed border-slate-700/50 rounded-xl p-12 bg-slate-800/20">
              <div className="bg-slate-800 p-6 rounded-full mb-6 animate-pulse">
                <Globe size={64} className="text-slate-500" />
              </div>
              <h2 className="text-2xl font-bold text-slate-300">Ready for Analysis</h2>
              <p className="text-slate-500 mt-2 max-w-md text-center">
                Select a mining lease boundary (KML/Shapefile) from the panel on the left to begin the automated detection pipeline.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;