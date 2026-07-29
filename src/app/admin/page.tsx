"use client";

import React, { useEffect, useState } from "react";

interface Conversation {
  id: string;
  status: string;
  lastMessageAt: string;
  customer: {
    name: string;
    waId: string;
  };
  messages: Array<{
    id: string;
    sender: string;
    content: string;
    createdAt: string;
  }>;
}

interface Lead {
  id: string;
  stage: string;
  interestedProduct: string;
  budget: number | null;
  createdAt: string;
  customer: {
    name: string;
    waId: string;
  };
}

interface SyncJob {
  id: string;
  status: string;
  type: string;
  startedAt: string;
  totalRecords: number;
  updatedRecords: number;
  failedRecords: number;
}

interface Metrics {
  serverStatus: string;
  lastChecked: string | null;
  serverUrl: string;
  totalChats: number;
  aiActive: number;
  humanTakeover: number;
  totalLeads: number;
  productCount: number;
  revenue: number;
  aiAccuracy: number;
}

interface Branding {
  brandName: string;
  primaryColor: string;
  secondaryColor: string;
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<
    "overview" | "chats" | "sync" | "products" | "simulator" | "sources" | "salespersons"
  >("overview");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [syncJobs, setSyncJobs] = useState<SyncJob[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Simulator state values
  const [simName, setSimName] = useState("Alice Developer");
  const [simPhone, setSimPhone] = useState("+19876543210");
  const [simMessage, setSimMessage] = useState("Do you have an RTX 4070 Super graphics card in stock?");
  const [simStatus, setSimStatus] = useState("");

  // Product Data Source Configuration states
  const [sourceActive, setSourceActive] = useState("LOCAL_CONNECTOR");
  const [sheetId, setSheetId] = useState("");
  const [sheetRange, setSheetRange] = useState("Sheet1!A:H");
  const [serviceAccountJson, setServiceAccountJson] = useState("");
  const [syncInterval, setSyncInterval] = useState(5);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [nextSync, setNextSync] = useState<string | null>(null);
  const [sourceStatus, setSourceStatus] = useState("IDLE");
  const [sourceError, setSourceError] = useState<string | null>(null);

  // AI Settings states
  const [contactPhone, setContactPhone] = useState("+919385811823");
  const [gstRate, setGstRate] = useState(18.0);

  // Excel Importer states
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState("MERGE");
  const [importStatus, setImportStatus] = useState("");
  const [importSummary, setImportSummary] = useState<any>(null);

  // Salespersons states
  const [salespersons, setSalespersons] = useState<any[]>([]);
  const [newSalesName, setNewSalesName] = useState("");
  const [newSalesPhone, setNewSalesPhone] = useState("");
  const [newSalesSpec, setNewSalesSpec] = useState("");

  // Products Database state
  const [products, setProducts] = useState<any[]>([]);

  const fetchDashboardData = async () => {
    try {
      const res = await fetch("/api/admin/dashboard", {
        headers: {
          "ngrok-skip-browser-warning": "true",
        },
      });
      const data = await res.json();
      if (data.success) {
        setMetrics(data.metrics);
        setConversations(data.activeConversations);
        setSyncJobs(data.recentSyncJobs);
        setLeads(data.recentLeads);
        setBranding(data.branding);
        setProducts(data.products || []);
      }
    } catch (e) {
      console.error("Failed to load dashboard data", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchSourceConfig = async () => {
    try {
      const res = await fetch("/api/admin/source-config", {
        headers: {
          "ngrok-skip-browser-warning": "true",
        },
      });
      const data = await res.json();
      if (data.success) {
        if (data.config) {
          const c = data.config;
          setSourceActive(c.activeSource);
          setSheetId(c.googleSheetId || "");
          setSheetRange(c.googleSheetRange || "Sheet1!A:H");
          setServiceAccountJson(c.googleServiceAccountJson || "");
          setSyncInterval(c.syncIntervalMinutes || 5);
          setLastSync(c.lastSyncAt);
          setNextSync(c.nextSyncAt);
          setSourceStatus(c.status);
          setSourceError(c.lastError);
        }
        if (data.aiSettings) {
          setContactPhone(data.aiSettings.contactPhone || "+919385811823");
          setGstRate(data.aiSettings.gstRate ?? 18.0);
        }
      }
    } catch (e) {
      console.error("Failed to load source configuration", e);
    }
  };

  const saveSourceConfig = async (triggerSyncNow = false) => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/source-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({
          activeSource: sourceActive,
          googleSheetId: sheetId,
          googleSheetRange: sheetRange,
          googleServiceAccountJson: serviceAccountJson,
          syncIntervalMinutes: syncInterval,
          contactPhone,
          gstRate,
          triggerSyncNow
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(triggerSyncNow ? "Settings saved and Google Sheets sync triggered!" : "Data Source configurations and AI settings saved!");
        fetchSourceConfig();
        fetchDashboardData();
      } else {
        alert(`Error saving configurations: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Network error: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const fetchSalespersons = async () => {
    try {
      const res = await fetch("/api/admin/salespersons", {
        headers: { "ngrok-skip-browser-warning": "true" },
      });
      const data = await res.json();
      if (data.success) {
        setSalespersons(data.salespersons || []);
      }
    } catch (e) {
      console.error("Failed to fetch salespersons", e);
    }
  };

  const handleAddSalesperson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSalesName || !newSalesPhone || !newSalesSpec) {
      alert("Please fill in all fields.");
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/salespersons", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({
          name: newSalesName,
          phone: newSalesPhone,
          specialization: newSalesSpec,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNewSalesName("");
        setNewSalesPhone("");
        setNewSalesSpec("");
        fetchSalespersons();
      } else {
        alert(`Error adding salesperson: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Network error: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSalesperson = async (id: string) => {
    if (!confirm("Are you sure you want to delete this salesperson?")) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/salespersons?id=${id}`, {
        method: "DELETE",
        headers: { "ngrok-skip-browser-warning": "true" },
      });
      const data = await res.json();
      if (data.success) {
        fetchSalespersons();
      } else {
        alert(`Error deleting salesperson: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Network error: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    fetchSourceConfig();
    fetchSalespersons();
    const interval = setInterval(() => {
      fetchDashboardData();
      // Only query status metrics in background, do not fetch config to avoid overwriting typed fields
    }, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const triggerAction = async (payload: any) => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify(payload),
      });
      await res.json();
      fetchDashboardData();
    } catch (error) {
      console.error(error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !activeChatId) return;

    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({
          action: "SEND_MESSAGE",
          conversationId: activeChatId,
          messageText: replyText,
        }),
      });
      if (res.ok) {
        setReplyText("");
        fetchDashboardData();
      }
    } catch (error) {
      console.error(error);
    } finally {
      setActionLoading(false);
    }
  };

  const selectedChat = conversations.find((c) => c.id === activeChatId);

  // White-label dynamic color theme variables
  const primaryThemeColor = branding?.primaryColor || "#06b6d4";
  const secondaryThemeColor = branding?.secondaryColor || "#6366f1";

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col font-sans">
      {/* Upper Navigation Bar */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <span className="h-4 w-4 rounded-full animate-pulse" style={{ backgroundColor: primaryThemeColor }} />
          <h1 className="text-xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
            Smart IT Solutions
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {/* Server Connection Status */}
          <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-850 px-3.5 py-1.5 rounded-full text-xs">
            <span
              className={`h-2.5 w-2.5 rounded-full ${metrics?.serverStatus === "ONLINE" ? "bg-green-500 shadow-lg shadow-green-500/50" : "bg-red-500 animate-ping"
                }`}
            />
            <span className="font-semibold text-slate-300">
              Local Server: {metrics?.serverStatus || "LOADING"}
            </span>
          </div>

          <button
            onClick={() => triggerAction({ action: "HEALTH_CHECK" })}
            disabled={actionLoading}
            className="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs px-4 py-2 rounded-xl transition-all font-medium disabled:opacity-50 cursor-pointer"
          >
            Ping Health
          </button>

          <button
            onClick={() => triggerAction({ action: "SYNC_NOW" })}
            disabled={actionLoading}
            style={{ backgroundColor: primaryThemeColor, color: "#000" }}
            className="hover:opacity-90 font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-lg disabled:opacity-50 cursor-pointer"
          >
            Sync Catalog
          </button>
        </div>
      </header>

      {/* Main Body Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Navigation Sidebar */}
        <aside className="w-64 border-r border-slate-900 p-6 flex flex-col justify-between">
          <div className="space-y-2">
            {[
              { id: "overview", label: "Dashboard Overview" },
              { id: "chats", label: "Conversations & AI" },
              { id: "sync", label: "Sync Monitor & Logs" },
              { id: "products", label: "Product Inventory" },
              { id: "sources", label: "Product Data Sources" },
              { id: "salespersons", label: "Sales Team & Specialities" },
              { id: "simulator", label: "WhatsApp Simulator" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer ${activeTab === tab.id
                    ? "bg-gradient-to-r from-cyan-950 to-indigo-950 border-l-4 border-cyan-400 text-white font-bold"
                    : "text-slate-400 hover:bg-slate-900 hover:text-white"
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="text-xs text-slate-500 border-t border-slate-900 pt-4 space-y-2">
            <div>
              Multi-Tenant SaaS Portal<br />
              v1.2.0 • Secured TLS
            </div>
            <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-900/60">
              This automation built by{" "}
              <a
                href="https://www.saivatech.in/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300 font-bold hover:underline"
              >
                saivatech
              </a>
            </div>
          </div>
        </aside>

        {/* Dashboard Work Area */}
        <section className="flex-1 p-8 overflow-y-auto">
          {loading ? (
            <div className="h-full flex items-center justify-center text-slate-400">
              Loading dashboard metrics...
            </div>
          ) : (
            <>
              {activeTab === "overview" && (
                <div className="space-y-8">
                  {/* Grid Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {[
                      { label: "Today's Volume", val: metrics?.totalChats, unit: "conversations" },
                      { label: "Revenue generated", val: `₹${metrics?.revenue?.toFixed(2)}`, unit: "sales cache" },
                      { label: "AI Resolution Rate", val: `${metrics?.aiAccuracy}%`, unit: "confidence" },
                      { label: "Catalog Cache Size", val: metrics?.productCount, unit: "synced items" },
                    ].map((m, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-900/40 border border-slate-850 p-6 rounded-2xl hover:border-slate-800 transition-all"
                      >
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                          {m.label}
                        </p>
                        <h3 className="text-3xl font-extrabold text-white mt-2">
                          {m.val}
                        </h3>
                        <span className="text-xs text-slate-400 mt-1 block">
                          {m.unit}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* CRM Leads Section */}
                  <div className="bg-slate-900/30 border border-slate-850 rounded-2xl p-6">
                    <h2 className="text-lg font-bold mb-4">Latest Conversational Leads (Captured by AI)</h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left text-slate-400">
                        <thead className="text-xs uppercase text-slate-500 border-b border-slate-900">
                          <tr>
                            <th className="py-3 px-4">Customer</th>
                            <th className="py-3 px-4">Contact</th>
                            <th className="py-3 px-4">Product Interest</th>
                            <th className="py-3 px-4">Budget Range</th>
                            <th className="py-3 px-4">Captured At</th>
                            <th className="py-3 px-4">Pipeline Stage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {leads.map((l) => (
                            <tr key={l.id} className="border-b border-slate-900 hover:bg-slate-900/20">
                              <td className="py-4 px-4 text-white font-bold">{l.customer.name}</td>
                              <td className="py-4 px-4">{l.customer.waId}</td>
                              <td className="py-4 px-4">{l.interestedProduct}</td>
                              <td className="py-4 px-4 text-cyan-400 font-semibold">
                                {l.budget ? `₹${l.budget}` : "Not Specified"}
                              </td>
                              <td className="py-4 px-4">
                                {new Date(l.createdAt).toLocaleDateString()}
                              </td>
                              <td className="py-4 px-4">
                                <span className="px-2.5 py-1 bg-cyan-950/40 border border-cyan-800 text-cyan-400 text-xs font-bold rounded-full">
                                  {l.stage}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {leads.length === 0 && (
                            <tr>
                              <td colSpan={6} className="text-center py-6 text-slate-500">
                                No leads captured by the AI agent yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "chats" && (
                <div className="h-[calc(100vh-12rem)] flex bg-slate-900/20 border border-slate-850 rounded-2xl overflow-hidden">
                  {/* Left Chats List */}
                  <div className="w-80 border-r border-slate-900 flex flex-col">
                    <div className="p-4 border-b border-slate-900 font-bold text-sm">
                      Customer Threads
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-1 p-2">
                      {conversations.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setActiveChatId(c.id);
                          }}
                          className={`w-full text-left p-4 rounded-xl flex flex-col transition-all cursor-pointer ${activeChatId === c.id
                              ? "bg-slate-900 border border-slate-800"
                              : "hover:bg-slate-900/40"
                            }`}
                        >
                          <div className="flex justify-between items-center w-full">
                            <span className="font-bold text-white text-sm">
                              {c.customer.name || "WhatsApp Client"}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {new Date(c.lastMessageAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 truncate mt-1">
                            {c.messages[c.messages.length - 1]?.content || "No messages yet"}
                          </p>
                          <span
                            className={`mt-2 text-[10px] self-start px-2 py-0.5 rounded ${c.status === "AI_ACTIVE"
                                ? "bg-cyan-950 text-cyan-400 border border-cyan-900"
                                : "bg-yellow-950 text-yellow-400 border border-yellow-900"
                              }`}
                          >
                            {c.status === "AI_ACTIVE" ? "AI Rep Active" : "Human Takeover"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Middle Conversation Details */}
                  {selectedChat ? (
                    <div className="flex-1 flex flex-col bg-slate-950/30">
                      {/* Chat Header controls */}
                      <div className="p-4 border-b border-slate-900 flex items-center justify-between">
                        <div>
                          <h4 className="font-bold">{selectedChat.customer.name}</h4>
                          <span className="text-xs text-slate-500">{selectedChat.customer.waId}</span>
                        </div>

                        <div className="flex items-center gap-3">
                          <label className="text-xs text-slate-400">Response Mode:</label>
                          <select
                            value={selectedChat.status}
                            disabled={actionLoading}
                            onChange={(e) =>
                              triggerAction({
                                action: "TOGGLE_AI",
                                conversationId: selectedChat.id,
                                status: e.target.value,
                              })
                            }
                            className="bg-slate-900 border border-slate-800 text-xs px-3 py-1.5 rounded-lg text-white"
                          >
                            <option value="AI_ACTIVE">AI Sales Rep</option>
                            <option value="HUMAN_TAKEOVER">Human Takeover</option>
                          </select>
                        </div>
                      </div>

                      {/* Messages list */}
                      <div className="flex-1 p-6 overflow-y-auto space-y-4">
                        {selectedChat.messages.map((m) => (
                          <div
                            key={m.id}
                            className={`flex flex-col max-w-lg ${m.sender === "CUSTOMER" ? "mr-auto items-start" : "ml-auto items-end"
                              }`}
                          >
                            <span className="text-[10px] text-slate-500 mb-1">
                              {m.sender} • {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <div
                              className={`p-3.5 rounded-2xl text-sm leading-relaxed ${m.sender === "CUSTOMER"
                                  ? "bg-slate-900 text-white rounded-tl-none border border-slate-850"
                                  : m.sender === "AI"
                                    ? "bg-cyan-950/50 border border-cyan-800 text-cyan-100 rounded-tr-none"
                                    : "bg-indigo-950/50 border border-indigo-850 text-indigo-100 rounded-tr-none"
                                }`}
                            >
                              {m.content}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Reply Input Form */}
                      <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-900 flex gap-3">
                        <input
                          type="text"
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Type manual reply (switches mode to Human Takeover)..."
                          className="flex-1 bg-slate-900 border border-slate-850 px-4 py-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-500 text-sm"
                        />
                        <button
                          type="submit"
                          disabled={actionLoading || !replyText.trim()}
                          className="bg-indigo-600 hover:bg-indigo-500 font-semibold px-6 py-3 rounded-xl text-sm disabled:opacity-50 cursor-pointer"
                        >
                          Send Outbound
                        </button>
                      </form>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
                      Select a conversational thread to monitor logs.
                    </div>
                  )}
                </div>
              )}

              {activeTab === "sync" && (
                <div className="space-y-6">
                  <div className="bg-slate-900/30 border border-slate-850 rounded-2xl p-6">
                    <h3 className="text-lg font-bold mb-4">Local DB Incremental Sync Runs</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left text-slate-400">
                        <thead className="text-xs uppercase text-slate-500 border-b border-slate-900">
                          <tr>
                            <th className="py-3 px-4">Job ID</th>
                            <th className="py-3 px-4">Type</th>
                            <th className="py-3 px-4">Sync Status</th>
                            <th className="py-3 px-4">Total Records</th>
                            <th className="py-3 px-4">Updated</th>
                            <th className="py-3 px-4">Failures</th>
                            <th className="py-3 px-4">Started At</th>
                          </tr>
                        </thead>
                        <tbody>
                          {syncJobs.map((job) => (
                            <tr key={job.id} className="border-b border-slate-900 hover:bg-slate-900/20">
                              <td className="py-4 px-4 font-mono text-xs">{job.id}</td>
                              <td className="py-4 px-4 font-semibold text-white">{job.type}</td>
                              <td className="py-4 px-4">
                                <span
                                  className={`px-2.5 py-1 text-xs font-bold rounded-full border ${job.status === "COMPLETED"
                                      ? "bg-green-950/40 border-green-800 text-green-400"
                                      : "bg-red-950/40 border-red-800 text-red-400"
                                    }`}
                                >
                                  {job.status}
                                </span>
                              </td>
                              <td className="py-4 px-4">{job.totalRecords}</td>
                              <td className="py-4 px-4 text-green-400">{job.updatedRecords}</td>
                              <td className="py-4 px-4 text-red-400">{job.failedRecords}</td>
                              <td className="py-4 px-4">
                                {new Date(job.startedAt).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "products" && (
                <div className="bg-slate-900/30 border border-slate-850 rounded-2xl p-6 space-y-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-lg font-bold">Local Cache Product Catalog</h3>
                      <p className="text-xs text-slate-400 mt-1">
                        Displaying product listings currently stored in your PostgreSQL cache replica.
                      </p>
                    </div>
                    <span className="text-xs bg-slate-900 border border-slate-850 px-3 py-1 text-slate-400 rounded-lg">
                      Catalog Total: {products.length}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-slate-400">
                      <thead className="text-xs uppercase text-slate-500 border-b border-slate-900">
                        <tr>
                          <th className="py-3 px-4">Category</th>
                          <th className="py-3 px-4">Description</th>
                          <th className="py-3 px-4">Model No</th>
                          <th className="py-3 px-4">CDC</th>
                          <th className="py-3 px-4">CDC + 18% GST</th>
                          <th className="py-3 px-4">PDC</th>
                          <th className="py-3 px-4">PDC + 18% GST</th>
                          <th className="py-3 px-4">Source</th>
                          <th className="py-3 px-4">Specifications</th>
                          <th className="py-3 px-4">Last Updated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {products.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="py-8 text-center text-slate-500">
                              No product listings found in database cache. Try synchronizing or importing.
                            </td>
                          </tr>
                        ) : (
                          products.map((p) => {
                            const specs = p.specifications ? JSON.parse(p.specifications) : {};
                            const cdcVal = specs.CDC || specs.cdc || "-";
                            const pdcVal = specs.PDC || specs.pdc || p.price || 0;
                            const cdcGstInclVal = cdcVal !== "-" ? parseFloat(String(cdcVal)) * 1.18 : null;
                            const gstInclVal = parseFloat(String(pdcVal)) * 1.18;

                            return (
                              <tr key={p.id} className="border-b border-slate-900 hover:bg-slate-900/20">
                                <td className="py-4 px-4">
                                  <span className="px-2 py-0.5 text-[10px] bg-slate-850 rounded-lg border border-slate-800 text-slate-300">
                                    {p.category?.name || "Uncategorized"}
                                  </span>
                                </td>
                                <td className="py-4 px-4 font-bold text-white">{p.name}</td>
                                <td className="py-4 px-4 font-mono text-xs text-slate-400">{p.localId}</td>
                                <td className="py-4 px-4 text-cyan-400 font-mono font-semibold">
                                  {cdcVal !== "-" ? `₹${Math.round(parseFloat(String(cdcVal)))}` : "-"}
                                </td>
                                <td className="py-4 px-4 text-emerald-400 font-mono font-semibold">
                                  {cdcGstInclVal !== null ? `₹${Math.round(cdcGstInclVal)}` : "-"}
                                </td>
                                <td className="py-4 px-4 text-cyan-400 font-mono font-semibold">
                                  {pdcVal ? `₹${Math.round(parseFloat(String(pdcVal)))}` : "-"}
                                </td>
                                <td className="py-4 px-4 text-emerald-400 font-mono font-semibold">
                                  {pdcVal ? `₹${Math.round(gstInclVal)}` : "-"}
                                </td>
                                <td className="py-4 px-4 text-xs font-mono text-indigo-400">{p.syncSource}</td>
                                <td className="py-4 px-4 text-xs">
                                  {p.specifications ? (
                                    <div className="flex flex-wrap gap-1">
                                      {Object.entries(specs)
                                        .filter(([k]) => k !== "CDC" && k !== "PDC")
                                        .map(([k, v]) => (
                                          <span key={k} className="text-[10px] bg-slate-900 border border-slate-850 px-1.5 py-0.5 rounded text-slate-300">
                                            <strong>{k}:</strong> {String(v)}
                                          </span>
                                        ))}
                                    </div>
                                  ) : (
                                    <span className="text-slate-600">-</span>
                                  )}
                                </td>
                                <td className="py-4 px-4 text-xs text-slate-500">
                                  {new Date(p.updatedAt).toLocaleString()}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === "simulator" && (
                <div className="max-w-2xl bg-slate-900/30 border border-slate-850 rounded-2xl p-8 space-y-6">
                  <div>
                    <h3 className="text-lg font-bold">Local WhatsApp Webhook Simulator</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Simulate incoming customer messages received by your WhatsApp webhook. Testing is performed locally, bypassing Meta servers.
                    </p>
                  </div>

                  {simStatus && (
                    <div className="p-4 bg-slate-900 border border-slate-850 text-xs rounded-xl font-mono text-cyan-400">
                      {simStatus}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Customer Profile Name</label>
                      <input
                        type="text"
                        value={simName}
                        onChange={(e) => setSimName(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-850 px-4 py-2.5 rounded-xl text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Customer WhatsApp ID (Phone Number)</label>
                      <input
                        type="text"
                        value={simPhone}
                        onChange={(e) => setSimPhone(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-850 px-4 py-2.5 rounded-xl text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Simulated Message Text</label>
                      <textarea
                        rows={3}
                        value={simMessage}
                        onChange={(e) => setSimMessage(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-850 px-4 py-2.5 rounded-xl text-sm"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        setSimStatus("Dispatching simulated event...");
                        try {
                          const payload = {
                            entry: [
                              {
                                changes: [
                                  {
                                    value: {
                                      messaging_product: "whatsapp",
                                      metadata: {
                                        display_phone_number: "15550100777",
                                        phone_number_id: "123456789012345"
                                      },
                                      contacts: [
                                        {
                                          profile: { name: simName },
                                          wa_id: simPhone.replace(/\+/g, "")
                                        }
                                      ],
                                      messages: [
                                        {
                                          from: simPhone.replace(/\+/g, ""),
                                          id: `wamid.Simulated_${Math.random().toString(36).substr(2, 9)}`,
                                          timestamp: Math.floor(Date.now() / 1000).toString(),
                                          text: { body: simMessage },
                                          type: "text"
                                        }
                                      ]
                                    },
                                    field: "messages"
                                  }
                                ]
                              }
                            ]
                          };

                          const res = await fetch("/api/webhooks/whatsapp", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              "ngrok-skip-browser-warning": "true",
                            },
                            body: JSON.stringify(payload)
                          });

                          const data = await res.json();
                          if (res.ok) {
                            setSimStatus("Webhook accepted successfully! Navigate to 'Conversations & AI' tab to see response history.");
                            fetchDashboardData();
                          } else {
                            setSimStatus(`Webhook rejected: ${data.error || "Unknown error"}`);
                          }
                        } catch (err: any) {
                          setSimStatus(`Failed: ${err.message}`);
                        }
                      }}
                    >
                      Trigger Simulated Webhook POST
                    </button>
                  </div>
                </div>
              )}

              {activeTab === "sources" && (
                <div className="space-y-8 max-w-4xl">
                  {/* Selector panel */}
                  <div className="bg-slate-900/30 border border-slate-850 rounded-2xl p-6 space-y-4">
                    <h3 className="text-lg font-bold">Product Data Source configuration</h3>
                    <p className="text-xs text-slate-400">
                      Select how your products catalog should be synchronised. Only one source is active at a time. The system stores the last successfully fetched catalog as a local cloud PostgreSQL fallback cache.
                    </p>

                    <div className="flex items-center gap-4 pt-2">
                      <select
                        value={sourceActive}
                        onChange={(e) => setSourceActive(e.target.value)}
                        className="bg-slate-900 border border-slate-800 text-sm px-4 py-2 rounded-xl text-white outline-none"
                      >
                        <option value="LOCAL_CONNECTOR">Local Server Connector (Windows PC)</option>
                        <option value="EXCEL_UPLOAD">Manual Excel / CSV File Upload</option>
                        <option value="GOOGLE_SHEETS">Google Sheets Live Sync</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => saveSourceConfig(false)}
                        disabled={actionLoading}
                        style={{ backgroundColor: primaryThemeColor, color: "#000" }}
                        className="px-6 py-2.5 font-bold text-xs rounded-xl cursor-pointer hover:opacity-90 transition-all disabled:opacity-50"
                      >
                        Save Active Source
                      </button>
                    </div>
                  </div>

                  {/* Global Sales & AI Settings card */}
                  <div className="bg-slate-900/30 border border-slate-850 rounded-2xl p-6 space-y-4">
                    <h3 className="text-lg font-bold">Global Sales & AI Settings</h3>
                    <p className="text-xs text-slate-400">
                      Configure the sales contact handover phone number and the default GST tax rate used by the AI chatbot.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1">
                        <label className="block text-xs text-slate-400">Sales Contact Number</label>
                        <input
                          type="text"
                          value={contactPhone}
                          onChange={(e) => setContactPhone(e.target.value)}
                          placeholder="e.g. +919385811823"
                          className="w-full bg-slate-900 border border-slate-850 px-4 py-2.5 rounded-xl text-sm text-white outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs text-slate-400">Default GST Rate (%)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={gstRate}
                          onChange={(e) => setGstRate(parseFloat(e.target.value) || 0)}
                          placeholder="18.0"
                          className="w-full bg-slate-900 border border-slate-850 px-4 py-2.5 rounded-xl text-sm text-white outline-none"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => saveSourceConfig(false)}
                      style={{ backgroundColor: primaryThemeColor, color: "#000" }}
                      className="px-6 py-2.5 font-bold text-xs rounded-xl cursor-pointer hover:opacity-90 transition-all disabled:opacity-50"
                    >
                      Save Sales & AI Settings
                    </button>
                  </div>

                  {/* Excel Manual Importer layout */}
                  {sourceActive === "EXCEL_UPLOAD" && (
                    <div className="bg-slate-900/30 border border-slate-850 rounded-2xl p-8 space-y-6">
                      <div>
                        <h4 className="font-bold text-base">Manual Excel / CSV Importer</h4>
                        <p className="text-xs text-slate-400 mt-1">
                          Upload spreadsheet files containing headers: <code className="text-cyan-400 font-mono">CATEGORY</code>, <code className="text-cyan-400 font-mono">DESCRIPTION</code>, <code className="text-cyan-400 font-mono">MODEL NO</code>, <code className="text-cyan-400 font-mono">PDC</code>, <code className="text-cyan-400 font-mono">CDC</code>.
                        </p>
                      </div>

                      {importStatus && (
                        <div className="p-4 bg-slate-900 border border-slate-850 rounded-xl text-xs font-mono text-cyan-400">
                          {importStatus}
                        </div>
                      )}

                      {importSummary && (
                        <div className="p-4 bg-slate-900/60 border border-slate-850 rounded-xl space-y-2 text-xs">
                          <p className="font-bold text-white">Import Summary Result:</p>
                          <ul className="list-disc pl-4 space-y-1 text-slate-300">
                            <li>Successful Imports: <span className="text-green-400 font-bold">{importSummary.imported}</span></li>
                            <li>Skipped Empty Rows: <span className="text-yellow-400">{importSummary.skipped}</span></li>
                            <li>Failed Rows: <span className="text-red-400">{importSummary.failed}</span></li>
                          </ul>
                          {importSummary.errors.length > 0 && (
                            <div className="pt-2 text-[10px] text-red-500 font-mono">
                              <p className="font-bold">Errors logged:</p>
                              {importSummary.errors.map((e: string, idx: number) => (
                                <p key={idx}>- {e}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="space-y-4">
                        <div className="flex flex-col gap-2">
                          <label className="text-xs text-slate-400">Select File</label>
                          <input
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                            className="bg-slate-900 border border-slate-850 px-4 py-2.5 rounded-xl text-sm file:bg-slate-800 file:border-none file:text-white file:text-xs file:px-4 file:py-1.5 file:rounded-lg file:cursor-pointer"
                          />
                        </div>

                        <div className="flex flex-col gap-2">
                          <label className="text-xs text-slate-400">Import Mode</label>
                          <select
                            value={importMode}
                            onChange={(e) => setImportMode(e.target.value)}
                            className="bg-slate-900 border border-slate-850 px-4 py-2.5 rounded-xl text-sm"
                          >
                            <option value="MERGE">Merge (Upsert changed items, keep other records)</option>
                            <option value="REPLACE">Replace (Wipe existing product listings and replace with file items)</option>
                          </select>
                        </div>

                        <button
                          type="button"
                          disabled={actionLoading || !importFile}
                          onClick={async () => {
                            if (!importFile) return;
                            setImportStatus("Uploading and parsing file buffer...");
                            setImportSummary(null);

                            const fd = new FormData();
                            fd.append("file", importFile);
                            fd.append("mode", importMode);

                            try {
                              const res = await fetch("/api/admin/products/import", {
                                method: "POST",
                                headers: {
                                  "ngrok-skip-browser-warning": "true",
                                },
                                body: fd
                              });
                              const data = await res.json();
                              if (res.ok) {
                                setImportStatus("File imported successfully!");
                                setImportSummary(data.summary);
                                fetchSourceConfig();
                                fetchDashboardData();
                              } else {
                                setImportStatus(`Import failed: ${data.error}`);
                              }
                            } catch (err: any) {
                              setImportStatus(`Network error during import: ${err.message}`);
                            }
                          }}
                          style={{ backgroundColor: primaryThemeColor, color: "#000" }}
                          className="px-6 py-3 font-bold text-xs rounded-xl cursor-pointer hover:opacity-90 disabled:opacity-50 transition-all"
                        >
                          Execute File Import
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Google Sheets Config layout */}
                  {sourceActive === "GOOGLE_SHEETS" && (
                    <div className="bg-slate-900/30 border border-slate-850 rounded-2xl p-8 space-y-6">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-base">Google Sheets Integration</h4>
                          <p className="text-xs text-slate-400 mt-1">
                            Share your sheet with your Google Service Account email client and register details below.
                          </p>
                        </div>

                        <div className="text-right text-xs">
                          <p className="text-slate-400">Sync Status:
                            <span className={`font-bold ml-1.5 ${sourceStatus === "IDLE" ? "text-green-400" : sourceStatus === "SYNCING" ? "text-cyan-400 animate-pulse" : "text-red-400"
                              }`}>{sourceStatus}</span>
                          </p>
                          <p className="text-[10px] text-slate-500 mt-1">Last Sync: {lastSync ? new Date(lastSync).toLocaleString() : "Never"}</p>
                          <p className="text-[10px] text-slate-500">Next Sync: {nextSync ? new Date(nextSync).toLocaleString() : "Scheduled by CRON"}</p>
                        </div>
                      </div>

                      {sourceError && (
                        <div className="p-4 bg-red-950/40 border border-red-800 text-xs rounded-xl font-mono text-red-400">
                          <p className="font-bold">Sync Error Logged:</p>
                          <p className="mt-1">{sourceError}</p>
                        </div>
                      )}

                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Google Spreadsheet ID</label>
                          <input
                            type="text"
                            value={sheetId}
                            onChange={(e) => setSheetId(e.target.value)}
                            placeholder="e.g. 1aBCdEffghIJKlMnopqrsTUV..."
                            className="w-full bg-slate-900 border border-slate-850 px-4 py-2.5 rounded-xl text-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Sheet Range</label>
                          <input
                            type="text"
                            value={sheetRange}
                            onChange={(e) => setSheetRange(e.target.value)}
                            placeholder="e.g. Sheet1!A:G"
                            className="w-full bg-slate-900 border border-slate-850 px-4 py-2.5 rounded-xl text-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Sync Interval (Minutes)</label>
                          <select
                            value={syncInterval}
                            onChange={(e) => setSyncInterval(parseInt(e.target.value, 10))}
                            className="w-full bg-slate-900 border border-slate-850 px-4 py-2.5 rounded-xl text-sm"
                          >
                            <option value={1}>Every 1 Minute</option>
                            <option value={5}>Every 5 Minutes (Recommended)</option>
                            <option value={15}>Every 15 Minutes</option>
                            <option value={60}>Every 1 Hour</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Google Service Account JSON</label>
                          <textarea
                            rows={6}
                            value={serviceAccountJson}
                            onChange={(e) => setServiceAccountJson(e.target.value)}
                            placeholder='Paste complete service account JSON contents starting with {"type": "service_account", ...}'
                            className="w-full bg-slate-900 border border-slate-850 px-4 py-2.5 rounded-xl text-xs font-mono"
                          />
                        </div>

                        <div className="flex gap-4">
                          <button
                            type="button"
                            disabled={actionLoading || !sheetId || !serviceAccountJson}
                            onClick={() => saveSourceConfig(false)}
                            className="px-6 py-3 bg-slate-900 hover:bg-slate-800 border border-slate-850 font-bold text-xs rounded-xl cursor-pointer transition-all"
                          >
                            Save Sheets Settings
                          </button>

                          <button
                            type="button"
                            disabled={actionLoading || !sheetId || !serviceAccountJson}
                            onClick={() => saveSourceConfig(true)}
                            style={{ backgroundColor: primaryThemeColor, color: "#000" }}
                            className="px-6 py-3 font-bold text-xs rounded-xl cursor-pointer hover:opacity-90 disabled:opacity-50 transition-all"
                          >
                            Save & Sync Google Sheet Now
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {sourceActive === "LOCAL_CONNECTOR" && (
                    <div className="bg-slate-900/30 border border-slate-850 rounded-2xl p-8 space-y-4">
                      <h4 className="font-bold text-base">Local Server Connector Settings</h4>
                      <p className="text-xs text-slate-400">
                        Synchronizing with a local inventory system running on Windows. Configuration parameters can be monitored on the main header. Use "Ping Health" or "Sync Catalog" to trigger processes.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "salespersons" && (
                <div className="space-y-8 max-w-4xl">
                  <div className="bg-slate-900/30 border border-slate-850 rounded-2xl p-6 space-y-6">
                    <div>
                      <h3 className="text-lg font-bold">Salesperson Team & Specializations</h3>
                      <p className="text-xs text-slate-400 mt-1">
                        Register sales representatives, their contact numbers, and service specialization tags (e.g. Storage / Memory Cards, CCTV Installation, Networking). The WhatsApp AI agent will use these to route clients.
                      </p>
                    </div>

                    <form onSubmit={handleAddSalesperson} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end bg-slate-950/60 p-4 border border-slate-850 rounded-xl">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Salesperson Name</label>
                        <input
                          type="text"
                          required
                          value={newSalesName}
                          onChange={(e) => setNewSalesName(e.target.value)}
                          placeholder="e.g. Rajesh Kumar"
                          className="w-full bg-slate-900 border border-slate-850 px-3 py-2 rounded-xl text-sm outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Contact Number</label>
                        <input
                          type="text"
                          required
                          value={newSalesPhone}
                          onChange={(e) => setNewSalesPhone(e.target.value)}
                          placeholder="e.g. +919442101823"
                          className="w-full bg-slate-900 border border-slate-850 px-3 py-2 rounded-xl text-sm outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Service Specialization</label>
                        <input
                          type="text"
                          required
                          value={newSalesSpec}
                          onChange={(e) => setNewSalesSpec(e.target.value)}
                          placeholder="e.g. Storage / Memory Cards"
                          className="w-full bg-slate-900 border border-slate-850 px-3 py-2 rounded-xl text-sm outline-none"
                        />
                      </div>
                      <div>
                        <button
                          type="submit"
                          disabled={actionLoading}
                          style={{ backgroundColor: primaryThemeColor, color: "#000" }}
                          className="w-full py-2.5 font-bold text-xs rounded-xl cursor-pointer hover:opacity-90 transition-all"
                        >
                          Add Representative
                        </button>
                      </div>
                    </form>

                    <div className="overflow-x-auto border border-slate-850 rounded-xl">
                      <table className="w-full text-sm text-left text-slate-400">
                        <thead className="text-xs uppercase bg-slate-950 text-slate-500 border-b border-slate-900">
                          <tr>
                            <th className="py-3 px-4">Name</th>
                            <th className="py-3 px-4">Phone Number</th>
                            <th className="py-3 px-4">Service Domain / Specialization</th>
                            <th className="py-3 px-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {salespersons.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-6 text-center text-slate-500">
                                No salespersons registered yet.
                              </td>
                            </tr>
                          ) : (
                            salespersons.map((s) => (
                              <tr key={s.id} className="border-b border-slate-900 hover:bg-slate-900/10">
                                <td className="py-3.5 px-4 text-white font-semibold">{s.name}</td>
                                <td className="py-3.5 px-4 font-mono text-cyan-400">{s.phone}</td>
                                <td className="py-3.5 px-4">
                                  <span className="px-2.5 py-1 bg-cyan-950/40 border border-cyan-800 text-cyan-400 text-xs font-bold rounded-full">
                                    {s.specialization}
                                  </span>
                                </td>
                                <td className="py-3.5 px-4 text-right">
                                  <button
                                    onClick={() => handleDeleteSalesperson(s.id)}
                                    disabled={actionLoading}
                                    className="px-3 py-1 bg-red-950/40 hover:bg-red-950 border border-red-800 text-red-400 text-xs font-bold rounded-lg cursor-pointer transition-all"
                                  >
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Global Web Application Credit Footer */}
          <footer className="mt-12 py-6 border-t border-slate-850 text-center text-xs text-slate-400">
            This automation built by{" "}
            <a
              href="https://www.saivatech.in/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 hover:text-cyan-300 font-bold hover:underline"
            >
              saivatech
            </a>
          </footer>
        </section>
      </div>
    </main>
  );
}
