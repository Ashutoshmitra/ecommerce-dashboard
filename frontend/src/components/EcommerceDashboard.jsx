import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import Papa from 'papaparse';
import _ from 'lodash';
import { Sun, Moon, Download, RefreshCw, Calendar, Filter, HelpCircle, Home, BarChart2, PieChart as PieChartIcon, Activity, DollarSign, TrendingUp, Award, Zap, Settings, AlertTriangle } from 'lucide-react';

// Main Dashboard Component
const EcommerceDashboard = ({ 
  apiService, 
  onRunScript, 
  onToggleScheduledUpdates, 
  onGenerateInsights, 
  onShowConfig, 
  updateStatus 
}) => {
  // State Management
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [filterDays, setFilterDays] = useState(30);
  const [attributionDays, setAttributionDays] = useState(7);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [showAIInsights, setShowAIInsights] = useState(false);
  const [aiInsight, setAiInsight] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState({});
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [productSortField, setProductSortField] = useState('revenue');
  const [productSortDirection, setProductSortDirection] = useState('desc');
  const [customDateStart, setCustomDateStart] = useState(() => {
    // Default to 30 days ago (matching default filterDays)
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date;
  });
  const [customDateEnd, setCustomDateEnd] = useState(new Date());
  const [useCustomDateRange, setUseCustomDateRange] = useState(false);
  // State for script execution logs and loading state
  const [scriptLogs, setScriptLogs] = useState('');
  const [isRunningScript, setIsRunningScript] = useState(false);
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(
    localStorage.getItem('scheduled_updates') === 'true'
  );

  // Theme colors
  const themeColors = {
    light: {
      background: '#f8f9fa',
      foreground: '#333',
      cardBackground: '#fff',
      border: '#eaeaea',
      primary: '#6366f1',
      secondary: '#ec4899',
      accent: '#8b5cf6',
      positive: '#10b981',
      negative: '#ef4444',
      neutral: '#6b7280',
      chart1: '#6366f1',
      chart2: '#ec4899',
      chart3: '#8b5cf6',
      chart4: '#10b981'
    },
    dark: {
      background: '#1a1c23',
      foreground: '#fff',
      cardBackground: '#252836',
      border: '#374151',
      primary: '#8b5cf6',
      secondary: '#ec4899',
      accent: '#6366f1',
      positive: '#10b981',
      negative: '#ef4444',
      neutral: '#9ca3af',
      chart1: '#8b5cf6',
      chart2: '#ec4899',
      chart3: '#6366f1',
      chart4: '#10b981'
    }
  };

  const theme = darkMode ? themeColors.dark : themeColors.light;

  // Campaign colors for consistent coloring
  const campaignColors = [
    '#6366f1', '#ec4899', '#8b5cf6', '#10b981', '#f59e0b', 
    '#ef4444', '#06b6d4', '#84cc16', '#f43f5e', '#64748b'
  ];
  const sampleData = `campaignName,Product Name,Ad Spend,Total Revenue,Total ROAS,Total Net Profit,Impressions,Clicks,CTR (%),Total Orders,Conversion Rate (%)
  "15 FEB - Urban Denim - 9.2 - SINGLE PRODUCT",Urban Denim,1200.45,3654.87,3.04,1454.42,42500,1800,4.24,82,4.56
  "24 FEB - C22 ADS Collection",Collection C22,950.32,2156.18,2.27,812.47,38900,1540,3.96,56,3.64
  "02 MAR - Vintage Tee - 7.8 - SINGLE PRODUCT",Vintage Tee,850.75,2854.63,3.36,1432.10,35400,1320,3.73,64,4.85
  "10 MAR - Modern Chic - 6.5 - SINGLE PRODUCT",Modern Chic,1050.20,1896.36,1.81,425.34,39200,1650,4.21,48,2.91
  "18 MAR - C28 ADS Collection",Collection C28,1500.60,4750.82,3.17,2150.33,58700,2350,4.00,105,4.47
  "25 MAR - Summer Dress - 8.1 - SINGLE PRODUCT",Summer Dress,920.50,1656.90,1.80,248.26,37800,1480,3.92,42,2.84
  "03 APR - Casual Jeans - 5.3 - SINGLE PRODUCT",Casual Jeans,750.30,1125.45,1.50,-75.18,31500,1280,4.06,36,2.81
  "12 APR - C31 ADS Collection",Collection C31,1350.75,3783.69,2.80,1297.72,52300,2120,4.05,89,4.20`;
  
  // Load data function
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Get the latest data file from the API
      let csvData;
      
      // First try to use the API service (preferred method)
      if (apiService) {
        try {
          // Get the latest data file
          const result = await apiService.getLatestDataFile();
          
          // Fetch the CSV content
          csvData = await apiService.fetchCSVData(result.file);
        } catch (apiError) {
          console.warn('Error loading data from API, falling back to static data:', apiError);
          
          // Fallback: use sample data
          csvData = sampleData;
        }
      } else {
        // Fallback: use sample data
        csvData = sampleData;
      }
      
      // Parse CSV data
      Papa.parse(csvData, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          // Clean up the data
          const cleanData = results.data
            .filter(row => Object.keys(row).length > 1) // Filter out empty rows
            .map(row => {
              // Fix the campaign name (it's in the first unnamed column)
              const campaignName = row[''] || 'Unknown Campaign';
              
              // Create a clean object with the campaign name
              return {
                campaignName,
                ...row
              };
            });
          
          setData(cleanData);
          setLastUpdated(new Date());
          setIsLoading(false);
        },
        error: (error) => {
          console.error('Error parsing CSV:', error);
          setIsLoading(false);
        }
      });
    } catch (error) {
      console.error('Error loading data:', error);
      setIsLoading(false);
      
      // Show an error message to the user
      alert(`Failed to load data: ${error.message}`);
    }
  }, [apiService]);

// Initial data load
useEffect(() => {
  loadData();
}, [loadData]);

  // Add this useEffect to synchronize the date range with filterDays
useEffect(() => {
  // Only update if we're not in custom date mode
  if (!useCustomDateRange) {
    const endDate = new Date(); // Today
    const startDate = new Date();
    
    if (filterDays > 0) {
      // Set start date based on filterDays (7, 30, 60, 90 days)
      startDate.setDate(startDate.getDate() - filterDays);
    } else {
      // If filterDays is 0 (All campaigns), default to 365 days
      startDate.setDate(startDate.getDate() - 365); 
    }
    
    setCustomDateStart(startDate);
    setCustomDateEnd(endDate);
  }
}, [filterDays, useCustomDateRange]);

useEffect(() => {
  // When changing tabs, ensure we maintain date filter consistency
  if (activeTab === 'campaigns' || activeTab === 'overview' || 
      activeTab === 'products' || activeTab === 'ai-insights') {
    // Nothing to do here - we now use the same filter UI across all tabs
    // and they all access the same state variables
  }
  
  // If we switch to settings, make sure the custom date inputs reflect current filter
  if (activeTab === 'settings' && !useCustomDateRange) {
    // The existing useEffect that syncs dates with filterDays will handle this
  }
}, [activeTab]);

/**
 * Extract a date from a campaign name like "15 FEB - Urban Denim"
 * @param {string} campaignName - The campaign name containing a date
 * @return {Date|null} - Extracted date or null if not parseable
 */
const extractDateFromCampaignName = (campaignName) => {
  if (!campaignName) return null;
  
  // Extract day and month from campaign name (e.g., "15 FEB - Urban Denim")
  const match = campaignName.match(/^(\d+)\s+([A-Za-z]+)/);
  if (!match) return null;
  
  const day = match[1];
  const month = match[2].toUpperCase();
  
  // Map abbreviated and full month names to their numerical values
  const monthMap = {
    'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5,
    'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11,
    'JANUARY': 0, 'FEBRUARY': 1, 'MARCH': 2, 'APRIL': 3, 'JUNE': 5,
    'JULY': 6, 'AUGUST': 7, 'SEPTEMBER': 8, 'OCTOBER': 9, 'NOVEMBER': 10, 'DECEMBER': 11
  };
  
  // If month is not recognized, return null
  if (monthMap[month] === undefined) return null;
  
  // Create a date object with the current year (2025 for this data)
  const currentYear = new Date().getFullYear();
  const date = new Date(currentYear, monthMap[month], parseInt(day));
  
  return date;
};

/**
 * Filter data array based on days back from current date
 * Uses campaign dates from either Campaign Start field or extracts from campaign name
 */
const filterDataByDays = useCallback((dataArray, daysBack) => {
  if (!dataArray.length) return dataArray;
  
  // If using custom date range, filter by that instead of days back
  if (useCustomDateRange && customDateStart && customDateEnd) {
    return dataArray.filter(item => {
      let campaignDate;
      
      // First try to use the Campaign Start date if available
      if (item['Campaign Start']) {
        campaignDate = new Date(item['Campaign Start']);
      } else {
        // Otherwise extract date from campaign name
        const campaignName = item.campaignName || item[''] || '';
        campaignDate = extractDateFromCampaignName(campaignName);
      }
      
      // If we can't determine a date, include the campaign by default
      if (!campaignDate) return true;
      
      // Include only campaigns between the custom date range
      return campaignDate >= customDateStart && campaignDate <= customDateEnd;
    });
  }
  
  // Standard days back filtering
  if (!daysBack) return dataArray;
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  
  return dataArray.filter(item => {
    let campaignDate;
    
    // First try to use the Campaign Start date if available
    if (item['Campaign Start']) {
      campaignDate = new Date(item['Campaign Start']);
    } else {
      // Otherwise extract date from campaign name
      const campaignName = item.campaignName || item[''] || '';
      campaignDate = extractDateFromCampaignName(campaignName);
    }
    
    // If we can't determine a date, include the campaign by default
    if (!campaignDate) return true;
    
    // Include only campaigns from after the cutoff date
    return campaignDate >= cutoffDate;
  });
}, [useCustomDateRange, customDateStart, customDateEnd]);

  const filteredData = useCallback(() => {
    if (!data.length) return [];
    
    // Filter data based on option selected (last 7 days, 30 days, etc.)
    const filtered = filterDataByDays(data, filterDays);
    
    // Sort filtered data by campaign date in descending order (most recent first)
    return filtered.sort((a, b) => {
      // First try to extract date from 'Campaign Start' field
      let dateA = a['Campaign Start'] ? new Date(a['Campaign Start']) : extractDateFromCampaignName(a.campaignName || a[''] || '');
      let dateB = b['Campaign Start'] ? new Date(b['Campaign Start']) : extractDateFromCampaignName(b.campaignName || b[''] || '');
      
      // If both dates are invalid, keep original order
      if (!dateA || !dateB) return 0;
      
      // Sort in descending order (most recent first)
      return dateB.getTime() - dateA.getTime();
    });
  }, [data, filterDays]);
  
  const renderFilterUI = () => (
    <div className="mb-4 flex flex-wrap items-center space-x-2">
      <span className="text-sm text-gray-600 dark:text-gray-400">
        Filter data by:
      </span>
      {useCustomDateRange ? (
        <div className="flex items-center">
          <span className="px-3 py-2 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
            Custom Range: {customDateStart.toLocaleDateString()} to {customDateEnd.toLocaleDateString()}
          </span>
          <button 
            className="ml-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            onClick={() => setUseCustomDateRange(false)}
            title="Clear custom range"
          >
            ✕
          </button>
        </div>
      ) : (
        <select 
          className="p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
          value={filterDays}
          onChange={(e) => setFilterDays(Number(e.target.value))}
          style={{ backgroundColor: theme.cardBackground, color: theme.foreground, borderColor: theme.border }}
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={60}>Last 60 days</option>
          <option value={90}>Last 90 days</option>
          <option value={0}>All campaigns</option>
        </select>
      )}
      
      <div className="text-xs text-gray-500 dark:text-gray-400 ml-2">
        {useCustomDateRange ? (
          <>
            Showing data in custom date range
            ({filteredData().length} of {data.length} campaigns)
          </>
        ) : filterDays > 0 ? (
          <>
            Showing data since {new Date(Date.now() - filterDays * 86400000).toLocaleDateString()}
            ({filteredData().length} of {data.length} campaigns)
          </>
        ) : (
          <>Showing all {data.length} campaigns</>
        )}
      </div>
      
      {/* Add a button to quickly switch to custom date range */}
      {!useCustomDateRange && (
        <button
          className="ml-2 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center"
          onClick={() => setActiveTab('settings')}
        >
          <Calendar size={14} className="mr-1" />
          Custom Range
        </button>
      )}
    </div>
  );
  
  const formatCampaignDate = (campaign) => {
    if (campaign['Campaign Start']) {
      return new Date(campaign['Campaign Start']).toLocaleDateString();
    }
    
    const campaignDate = extractDateFromCampaignName(campaign.campaignName || campaign[''] || '');
    return campaignDate ? campaignDate.toLocaleDateString() : 'Unknown date';
  };
  
  const handleChatSubmit = async (e) => {
    e.preventDefault();
    
    if (!chatInput.trim()) return;
    
    const userMessage = {
      role: 'user',
      content: chatInput,
      timestamp: new Date()
    };
    
    // Add user message to chat
    setChatMessages(prevMessages => [...prevMessages, userMessage]);
    setChatInput(''); // Clear input
    setIsChatLoading(true);
    
    try {
      // Prepare COMPLETE data for the AI - include ALL campaigns
      const dataSummary = {
        // Summary metrics
        metrics: summaryMetrics(),
        
        // Include ALL campaigns, not just top/worst ones
        allCampaigns: data.map(campaign => ({
          name: campaign.campaignName || campaign[''] || 'Unknown Campaign',
          product: campaign['Product Name'] || 'Unknown',
          adSpend: campaign['Ad Spend'] || 0,
          revenue: campaign['Total Revenue'] || 0,
          profit: campaign['Total Net Profit'] || 0,
          roas: campaign['Total ROAS'] || 0,
          impressions: campaign['Impressions'] || 0,
          clicks: campaign['Clicks'] || 0,
          ctr: campaign['CTR (%)'] || 0,
          orders: campaign['Total Orders'] || 0,
          conversionRate: campaign['Conversion Rate (%)'] || 0
        })),
        
        // Keep the original data for reference
        topCampaigns: topCampaigns().slice(0, 5),
        worstCampaigns: worstCampaigns().slice(0, 5),
        revenueByProduct: prepareRevenueByProduct(),
        campaignCount: data.length,
        totalSpend: data.reduce((sum, c) => sum + (c['Ad Spend'] || 0), 0),
        totalRevenue: data.reduce((sum, c) => sum + (c['Total Revenue'] || 0), 0),
        totalProfit: data.reduce((sum, c) => sum + (c['Total Net Profit'] || 0), 0),
        dateRange: `Last ${filterDays} days`
      };
      
      // Use the API service to generate a response
      let aiResponse;
      if (apiService) {
        // Context object with question and data
        const context = {
          question: chatInput,
          dashboardData: dataSummary
        };
        
        // Call the backend proxy instead of directly calling Anthropic
        aiResponse = await apiService.processChat(context);
      } else {
        // Fallback simulated response if no API available
        const fallbackResponses = [
          `Based on your data for the last ${filterDays} days, ${dataSummary.metrics.profitableCampaigns} out of ${dataSummary.metrics.totalCampaigns} campaigns are profitable.`,
          `Your overall ROAS is ${dataSummary.metrics.avgROAS?.toFixed(2)}, which ${dataSummary.metrics.avgROAS >= 1 ? 'is good' : 'needs improvement'}.`,
          `Your top performing campaign has a ROAS of ${topCampaigns()[0]?.['Total ROAS']?.toFixed(2) || 'N/A'}.`,
          `I recommend focusing on your most profitable product, which is ${prepareRevenueByProduct()[0]?.name || 'N/A'}.`,
          `Your total profit of $${dataSummary.totalProfit.toFixed(2)} ${dataSummary.totalProfit >= 0 ? 'is positive, showing your campaigns are effective overall.' : 'is negative, suggesting you need to optimize your campaigns.'}`
        ];
        
        // Pick a relevant response based on the query
        let response = "I don't have enough context to answer that specifically. Try asking about campaign performance, ROAS, or profit margins.";
        
        if (chatInput.toLowerCase().includes('roas')) {
          response = fallbackResponses[1];
        } else if (chatInput.toLowerCase().includes('campaign') || chatInput.toLowerCase().includes('top')) {
          response = fallbackResponses[2];
        } else if (chatInput.toLowerCase().includes('product')) {
          response = fallbackResponses[3];
        } else if (chatInput.toLowerCase().includes('profit')) {
          response = fallbackResponses[4];
        } else {
          response = fallbackResponses[0];
        }
        
        aiResponse = { 
          insight: response, 
          model: "Simulated AI" 
        };
      }
      
      // Create assistant message
      const assistantMessage = {
        role: 'assistant',
        content: aiResponse.insight,
        timestamp: new Date(),
        model: aiResponse.model || "AI Assistant"
      };
      
      // Add assistant message to chat
      setChatMessages(prevMessages => [...prevMessages, assistantMessage]);
    } catch (error) {
      console.error('Error in chat:', error);
      
      // Add error message
      const errorMessage = {
        role: 'assistant',
        content: `I encountered an error analyzing your data: ${error.message}. Please try again.`,
        timestamp: new Date(),
        isError: true
      };
      
      setChatMessages(prevMessages => [...prevMessages, errorMessage]);
    } finally {
      setIsChatLoading(false);
    }
  };
  
  // Download CSV data
  const downloadCSV = useCallback(() => {
    if (!data.length) return;
    
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ecommerce_analysis_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [data]);

  // Generate AI Insights - using the API service
  const generateAIInsight = useCallback(async (campaign) => {
    setAiLoading(true);
    
    try {
      let insights;
      if (onGenerateInsights) {
        // This will call the ApiIntegrationService.generateCampaignInsights/generateDashboardInsights
        // which will use AnthropicService (already properly implemented with Claude API)
        insights = await onGenerateInsights(campaign);
      } else {
        // Fallback - this is essentially the same as before
        if (campaign) {
          const isProfit = campaign['Total Net Profit'] > 0;
          const roas = campaign['Total ROAS'] || 0;
          
          const insight = isProfit 
            ? `Campaign "${campaign.campaignName}" is profitable with a net profit of €${campaign['Total Net Profit'].toFixed(2)}. The ROAS is ${roas.toFixed(2)}, which means for every $1 spent, you're earning €${roas.toFixed(2)}. This campaign is performing well and could benefit from increased budget allocation.`
            : `Campaign "${campaign.campaignName}" is currently unprofitable with a net loss of €${Math.abs(campaign['Total Net Profit']).toFixed(2)}. The ROAS is ${roas.toFixed(2)}, below the breakeven point of 1.0. Consider adjusting targeting, creative elements, or pausing this campaign if performance doesn't improve in the next 3-5 days.`;
          
          insights = { insight };
        } else {
          // Dashboard insights logic - same as before for fallback
          const totalCampaigns = data.length;
          const profitableCampaigns = data.filter(c => c['Total Net Profit'] > 0).length;
          const totalProfit = data.reduce((sum, c) => sum + (c['Total Net Profit'] || 0), 0);
          const avgRoas = data.reduce((sum, c) => sum + (c['Total ROAS'] || 0), 0) / totalCampaigns;
          
          const insight = totalProfit > 0
            ? `Your e-commerce campaigns are collectively profitable with a total net profit of €${totalProfit.toFixed(2)}. ${profitableCampaigns} out of ${totalCampaigns} campaigns (${((profitableCampaigns/totalCampaigns)*100).toFixed(1)}%) are profitable. Your average ROAS across all campaigns is ${avgRoas.toFixed(2)}. Focus on scaling your top performers and consider reallocating budget from underperforming campaigns.`
            : `Your e-commerce campaigns are collectively showing a net loss of €${Math.abs(totalProfit).toFixed(2)}. Only ${profitableCampaigns} out of ${totalCampaigns} campaigns (${((profitableCampaigns/totalCampaigns)*100).toFixed(1)}%) are profitable. Your average ROAS is ${avgRoas.toFixed(2)}, below the breakeven point. Focus on optimizing targeting, improving creative elements, and possibly pausing the worst-performing campaigns.`;
            
          insights = { insight };
        }
      }
      
      // Make sure we display the model name if available
      let insightText = insights.insight;
      if (insights.model && insights.model !== "Simulated AI" && insights.model !== "Error") {
        insightText += `\n\n_Analysis provided by ${insights.model}_`;
      }
      
      setAiInsight(insightText);
      setAiLoading(false);
      setShowAIInsights(true);
    } catch (error) {
      console.error('Error generating insights:', error);
      setAiInsight(`Error generating insights: ${error.message}. Please check your API configuration and try again.`);
      setAiLoading(false);
      setShowAIInsights(true);
    }
  }, [data, onGenerateInsights]);

// Calculate summary metrics
const summaryMetrics = useCallback(() => {
  if (!data.length) return {};
  
  const filtered = filteredData();
  
  // Extract refund metrics from the summary data (if available)
  // Look for refund metrics from the first data item (they're global metrics)
  const firstRow = data[0] || {};
  // These names should match what's in the CSV output from your backend
  const refundMetrics = {
    totalRefunds: firstRow['Total Refunds'] || 0,
    totalRefundValue: firstRow['Total Refund Value'] || 0,
    refundRate: firstRow['Refund Rate'] || 0,
    totalDisputes: firstRow['Total Disputes'] || 0,
    disputeRate: firstRow['Dispute Rate'] || 0,
    topRefundReasons: firstRow['Top Refund Reasons'] || '[]'
  };
  
  return {
    totalCampaigns: filtered.length,
    totalSpend: filtered.reduce((sum, row) => sum + (row['Ad Spend'] || 0), 0),
    totalRevenue: filtered.reduce((sum, row) => sum + (row['Total Revenue'] || 0), 0),
    totalProfit: filtered.reduce((sum, row) => sum + (row['Total Net Profit'] || 0), 0),
    avgROAS: filtered.reduce((sum, row) => sum + (row['Total ROAS'] || 0), 0) / filtered.length,
    profitableCampaigns: filtered.filter(row => row['Total Net Profit'] > 0).length,
    totalClicks: filtered.reduce((sum, row) => sum + (row['Clicks'] || 0), 0),
    totalImpressions: filtered.reduce((sum, row) => sum + (row['Impressions'] || 0), 0),
    totalOrders: filtered.reduce((sum, row) => sum + (row['Total Orders'] || 0), 0),
    // Add refund metrics
    ...refundMetrics
  };
}, [data, filteredData]);

  // Get top performing campaigns
  const topCampaigns = useCallback(() => {
    if (!data.length) return [];
    
    const filtered = filteredData();
    
    return _.chain(filtered)
      .filter(c => c['Total Revenue'] > 0)
      .sortBy(c => -c['Total Net Profit'])
      .take(5)
      .value();
  }, [data, filteredData]);

  // Get worst performing campaigns
  const worstCampaigns = useCallback(() => {
    if (!data.length) return [];
    
    const filtered = filteredData();
    
    return _.chain(filtered)
      .filter(c => c['Ad Spend'] > 0)
      .sortBy(c => c['Total Net Profit'])
      .take(5)
      .value();
  }, [data, filteredData]);

  // Prepare data for charts
  const prepareROASChart = useCallback(() => {
    if (!data.length) return [];
    
    const filtered = filteredData();
    
    return _.chain(filtered)
      .groupBy(item => {
        if (item['Total ROAS'] < 1) return 'Below 1';
        if (item['Total ROAS'] < 2) return '1-2';
        if (item['Total ROAS'] < 3) return '2-3';
        if (item['Total ROAS'] < 4) return '3-4';
        return '4+';
      })
      .map((value, key) => ({
        name: key,
        value: value.length
      }))
      .value();
  }, [data, filteredData]);

  const prepareProfitDistribution = useCallback(() => {
    if (!data.length) return [];
    
    const filtered = filteredData();
    const profitable = filtered.filter(c => c['Total Net Profit'] > 0);
    const unprofitable = filtered.filter(c => c['Total Net Profit'] <= 0);
    
    return [
      { name: 'Profitable', value: profitable.length },
      { name: 'Unprofitable', value: unprofitable.length }
    ];
  }, [data, filteredData]);

  const prepareRevenueByProduct = useCallback(() => {
    if (!data.length) return [];
    
    const filtered = filteredData();
    
    return _.chain(filtered)
      .groupBy('Product Name')
      .map((campaigns, product) => ({
        name: product || 'Unknown',
        revenue: _.sumBy(campaigns, 'Total Revenue'),
        profit: _.sumBy(campaigns, 'Total Net Profit'),
        orders: _.sumBy(campaigns, 'Total Orders'),
        campaigns: campaigns.length,
        margin: (_.sumBy(campaigns, 'Total Net Profit') / _.sumBy(campaigns, 'Total Revenue') * 100) || 0
      }))
      .filter(item => item.revenue > 0)
      .orderBy(['revenue'], ['desc'])
      .take(10)
      .value();
  }, [data, filteredData]);

  const prepareCampaignPerformance = useCallback(() => {
    if (!data.length) return [];
    
    const filtered = filteredData();
    
    // Sort campaigns by Net Profit
    const sortedByProfit = _.sortBy(filtered, item => -(item['Total Net Profit'] || 0));
    
    // Get top 5 and bottom 5 campaigns
    const topCampaigns = sortedByProfit.slice(0, 5);
    const bottomCampaigns = sortedByProfit.slice(-5).reverse();
    
    // Combine them
    const combinedCampaigns = [...topCampaigns, ...bottomCampaigns];
    
    return combinedCampaigns.map(campaign => ({
      name: campaign.campaignName?.length > 20 
        ? campaign.campaignName.substring(0, 20) + '...' 
        : (campaign.campaignName || campaign[''] || 'Unknown'),
      spend: campaign['Ad Spend'] || 0,
      revenue: campaign['Total Revenue'] || 0,
      profit: campaign['Total Net Profit'] || 0,
      roas: campaign['Total ROAS'] || 0,
      isTopCampaign: topCampaigns.includes(campaign) // Add flag to distinguish top campaigns
    }));
  }, [data, filteredData]);
  

  // Show campaign details modal
  const showCampaignDetails = (campaign) => {
    setModalContent(campaign);
    setIsModalOpen(true);
    // Generate AI insight for this campaign
    generateAIInsight(campaign);
  };

  // Modal Component
  const CampaignModal = () => {
    if (!isModalOpen || !modalContent) return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-screen overflow-auto" style={{ backgroundColor: theme.cardBackground, color: theme.foreground }}>
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Campaign Details</h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-100"
              >
                ✕
              </button>
            </div>
            
            
            <div className="mb-6">
              <h3 className="text-xl mb-2">{modalContent.campaignName}</h3>
              <p className="text-gray-600 dark:text-gray-300">Product: {modalContent['Product Name'] || 'N/A'}</p>
              <p className="text-gray-600 dark:text-gray-300">
                Campaign Period: {new Date(modalContent['Campaign Start']).toLocaleDateString()} - {new Date(modalContent['Campaign End']).toLocaleDateString()}
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg">
                <h4 className="font-bold mb-2">Financial Summary</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>Ad Spend:</div>
                  <div className="text-right">€{modalContent['Ad Spend']?.toFixed(2) || '0.00'}</div>
                  
                  <div>Total Revenue:</div>
                  <div className="text-right">€{modalContent['Total Revenue']?.toFixed(2) || '0.00'}</div>
                  
                  <div>Net Profit:</div>
                  <div className="text-right" style={{ color: (modalContent['Total Net Profit'] || 0) > 0 ? theme.positive : theme.negative }}>
                    €{modalContent['Total Net Profit']?.toFixed(2) || '0.00'}
                  </div>
                  
                  <div>ROAS:</div>
                  <div className="text-right" style={{ color: (modalContent['Total ROAS'] || 0) >= 1 ? theme.positive : theme.negative }}>
                    {modalContent['Total ROAS']?.toFixed(2) || '0.00'}
                  </div>
                  
                  <div>Profit Margin:</div>
                  <div className="text-right">
                    {modalContent['Total Profit Margin (%)'] ? `${modalContent['Total Profit Margin (%)'].toFixed(2)}%` : 'N/A'}
                  </div>
                </div>
              </div>
              
              <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg">
                <h4 className="font-bold mb-2">Performance Metrics</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>Impressions:</div>
                  <div className="text-right">{modalContent['Impressions']?.toLocaleString() || '0'}</div>
                  
                  <div>Clicks:</div>
                  <div className="text-right">{modalContent['Clicks']?.toLocaleString() || '0'}</div>
                  
                  <div>CTR:</div>
                  <div className="text-right">{modalContent['CTR (%)']?.toFixed(2) || '0.00'}%</div>
                  
                  <div>Orders:</div>
                  <div className="text-right">{modalContent['Total Orders']?.toLocaleString() || '0'}</div>
                  
                  <div>Conversion Rate:</div>
                  <div className="text-right">{modalContent['Conversion Rate (%)']?.toFixed(2) || '0.00'}%</div>
                  
                  <div>CPA:</div>
                  <div className="text-right">
                    {modalContent['CPA'] ? `€${modalContent['CPA'].toFixed(2)}` : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg mb-6">
              <h4 className="font-bold mb-2">AI Analysis</h4>
              {aiLoading ? (
                <div className="flex items-center justify-center h-20">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500"></div>
                </div>
              ) : (
                <div className="whitespace-pre-line">
                  {aiInsight || "No AI insights available. Click 'Generate AI Analysis' to get insights."}
                </div>
              )}
            </div>
            
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded"
              >
                Close
              </button>
              <button 
                onClick={() => generateAIInsight(modalContent)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded flex items-center gap-2"
                disabled={aiLoading}
              >
                {aiLoading ? 'Generating...' : 'Generate AI Analysis'}
                {aiLoading ? null : <Zap size={18} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Dashboard tabs
  const renderOverviewTab = () => {
    const metrics = summaryMetrics();
    
    // Animation delay for cards
    const getAnimationDelay = (index) => `${index * 0.1}s`;
    
    return (
      <div className="space-y-6">
      {/* Add Date Selector at the top */}
      <div className="mb-4">
        {renderFilterUI()}
      </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { 
            title: 'Total Revenue', 
            value: `€${metrics.totalRevenue?.toFixed(2) || '0.00'}`,
            icon: <DollarSign size={20} />,
            color: theme.primary
          },
          { 
            title: 'Net Profit', 
            value: `€${metrics.totalProfit?.toFixed(2) || '0.00'}`,
            icon: <TrendingUp size={20} />,
            color: metrics.totalProfit >= 0 ? theme.positive : theme.negative
          },
          { 
            title: 'ROAS', 
            value: metrics.avgROAS?.toFixed(2) || '0.00',
            icon: <Activity size={20} />,
            color: (metrics.avgROAS || 0) >= 1 ? theme.positive : theme.negative
          },
          { 
            title: 'Profitable Campaigns', 
            value: `${metrics.profitableCampaigns || 0}/${metrics.totalCampaigns || 0}`,
            icon: <Award size={20} />,
            color: theme.accent
          }
        ].map((card, index) => (
            <div 
              key={card.title}
              className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 transform transition duration-300 hover:scale-105"
              style={{ 
                backgroundColor: theme.cardBackground, 
                borderColor: theme.border,
                animationDelay: getAnimationDelay(index),
                animationName: 'fadeInUp',
                animationDuration: '0.5s',
                animationFillMode: 'both',
              }}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">{card.title}</p>
                  <h3 className="text-2xl font-bold mt-1" style={{ color: card.color }}>{card.value}</h3>
                </div>
                <div 
                  className="p-2 rounded-full"
                  style={{ backgroundColor: `${card.color}20` }}
                >
                  <div style={{ color: card.color }}>{card.icon}</div>
                </div>
              </div>
            </div>
          ))}

</div>
{/* Refund Metrics Cards */}
<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
  {/* Refund Rate Card */}
  <div 
    className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 transform transition duration-300 hover:scale-105"
    style={{ 
      backgroundColor: theme.cardBackground, 
      borderColor: theme.border,
      animationName: 'fadeInUp',
      animationDuration: '0.5s',
      animationFillMode: 'both',
    }}
  >
    <div className="flex justify-between items-start">
      <div>
        <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Refund Rate</p>
        <h3 className="text-2xl font-bold mt-1" style={{ 
          color: (metrics.refundRate || 0) > 5 ? theme.negative : theme.positive 
        }}>
          {(metrics.refundRate || 0).toFixed(2)}%
        </h3>
      </div>
      <div 
        className="p-2 rounded-full"
        style={{ backgroundColor: `${(metrics.refundRate || 0) > 5 ? theme.negative : theme.positive}20` }}
      >
        <RefreshCw size={20} style={{ color: (metrics.refundRate || 0) > 5 ? theme.negative : theme.positive }} />
      </div>
    </div>
    <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">
      {metrics.totalRefunds || 0} refunds / {metrics.totalOrders || 0} orders
    </p>
    <p className="text-xs text-gray-500 italic mt-1">
    * Refund metrics represent store-wide data and are not affected by date filters
    </p>
  </div>

  {/* Total Refunds Card */}
  <div 
    className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 transform transition duration-300 hover:scale-105"
    style={{ 
      backgroundColor: theme.cardBackground, 
      borderColor: theme.border,
      animationName: 'fadeInUp',
      animationDuration: '0.5s',
      animationFillMode: 'both',
    }}
  >
    <div className="flex justify-between items-start">
      <div>
        <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Total Refunds</p>
        <h3 className="text-2xl font-bold mt-1">{metrics.totalRefunds || 0}</h3>
        <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">
          Value: €{(metrics.totalRefundValue || 0).toFixed(2)}
        </p>
      </div>
      <div 
        className="p-2 rounded-full"
        style={{ backgroundColor: `${theme.primary}20` }}
      >
        <div style={{ color: theme.primary }}>
          <RefreshCw size={20} />
        </div>
      </div>
    </div>
    <p className="text-xs text-gray-500 italic mt-1">
    * Refund metrics represent store-wide data and are not affected by date filters
    </p>
  </div>

  {/* Dispute Rate Card */}
  <div 
    className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 transform transition duration-300 hover:scale-105"
    style={{ 
      backgroundColor: theme.cardBackground, 
      borderColor: theme.border,
      animationName: 'fadeInUp',
      animationDuration: '0.5s',
      animationFillMode: 'both',
    }}
  >
    <div className="flex justify-between items-start">
      <div>
        <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Dispute Rate</p>
        <h3 className="text-2xl font-bold mt-1" style={{ 
          color: (metrics.disputeRate || 0) > 1 ? theme.negative : theme.positive 
        }}>
          {(metrics.disputeRate || 0).toFixed(2)}%
        </h3>
      </div>
      <div 
        className="p-2 rounded-full"
        style={{ backgroundColor: `${(metrics.disputeRate || 0) > 1 ? theme.negative : theme.positive}20` }}
      >
        <AlertTriangle size={20} style={{ color: (metrics.disputeRate || 0) > 1 ? theme.negative : theme.positive }} />
      </div>
    </div>
    <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">
      {metrics.totalDisputes || 0} disputes / {metrics.totalOrders || 0} orders
    </p>
    <p className="text-xs text-gray-500 italic mt-1">
    * Refund metrics represent store-wide data and are not affected by date filters
    </p>
  </div>
  <div 
    className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 transform transition duration-300 hover:scale-105 col-span-3"
    style={{ 
      backgroundColor: theme.cardBackground, 
      borderColor: theme.border,
      animationName: 'fadeInUp',
      animationDuration: '0.5s',
      animationFillMode: 'both',
    }}
  >
    <div className="flex justify-between items-start mb-3">
      <div>
        <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Top Refund Reasons</p>
      </div>
      <div 
        className="p-2 rounded-full"
        style={{ backgroundColor: `${theme.accent}20` }}
      >
        <div style={{ color: theme.accent }}>
          <HelpCircle size={20} />
        </div>
      </div>
    </div>
    
    {/* Render the top refund reasons */}
    <div className="grid grid-cols-1 gap-2">
      {(() => {
        try {
          // The reasons are stored as a JSON string in the first row
          const reasonsStr = data[0]?.['Top Refund Reasons'];
          if (!reasonsStr) return <p className="text-sm text-gray-500">No refund reason data available</p>;
          
          const reasons = JSON.parse(reasonsStr);
          if (!reasons.length) return <p className="text-sm text-gray-500">No refund reasons found</p>;
          
          return (
            <div className="space-y-2">
              {reasons.map(([reason, count], index) => (
                <div key={index} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded">
                  <span className="text-sm truncate flex-1">{reason}</span>
                  <span className="text-sm font-medium ml-2 px-2 py-1 bg-gray-200 dark:bg-gray-600 rounded">{count} refunds</span>
                </div>
              ))}
            </div>
          );
        } catch (e) {
          console.error("Error parsing refund reasons:", e);
          return <p className="text-sm text-gray-500">Error loading refund reasons</p>;
        }
      })()}
    </div>
  </div>
</div>
        
        {/* ROAS Distribution and Profitability Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div 
            className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
            style={{ backgroundColor: theme.cardBackground, borderColor: theme.border }}
          >
            <h3 className="text-lg font-semibold mb-4">ROAS Distribution</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={prepareROASChart()}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    labelLine={true}
                    animationDuration={750}
                    animationBegin={250}
                  >
                    {prepareROASChart().map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={campaignColors[index % campaignColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} campaigns`, 'Count']} />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          {/* Profitable vs Unprofitable */}
          <div 
            className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
            style={{ backgroundColor: theme.cardBackground, borderColor: theme.border }}
          >
            <h3 className="text-lg font-semibold mb-4">Campaign Profitability</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={prepareProfitDistribution()}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    labelLine={true}
                    animationDuration={750}
                    animationBegin={500}
                  >
                    <Cell fill={theme.positive} />
                    <Cell fill={theme.negative} />
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} campaigns`, 'Count']} />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        
        {/* Revenue by Product */}
        <div 
          className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
          style={{ backgroundColor: theme.cardBackground, borderColor: theme.border }}
        >
          <h3 className="text-lg font-semibold mb-4">Top Products by Revenue</h3>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={prepareRevenueByProduct()}
                margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                <XAxis 
                  dataKey="name" 
                  angle={-45} 
                  textAnchor="end" 
                  height={70} 
                  tick={{ fill: theme.foreground, fontSize: 12 }}
                />
                <YAxis tick={{ fill: theme.foreground }} />
                <Tooltip 
                  formatter={(value, name) => {
                    if (name === 'revenue' || name === 'profit') {
                      return [`€${value.toFixed(2)}`, name.charAt(0).toUpperCase() + name.slice(1)];
                    }
                    return [value, name.charAt(0).toUpperCase() + name.slice(1)];
                  }}
                  contentStyle={{ backgroundColor: theme.cardBackground, borderColor: theme.border, color: theme.foreground }}
                />
                <Legend wrapperStyle={{ color: theme.foreground }} />
                <Bar dataKey="revenue" fill={theme.chart1} name="Revenue" animationDuration={1500} />
                <Bar dataKey="profit" fill={theme.chart4} name="Profit" animationDuration={1500} animationBegin={300} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  };
  const renderCampaignsTab = () => {
    return (
      <div className="space-y-6">
        <div 
          className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
          style={{ backgroundColor: theme.cardBackground, borderColor: theme.border }}
        >
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Campaign Performance</h3>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Showing top 5 and bottom 5 campaigns by profit for selected period
            </div>
          </div>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={prepareCampaignPerformance()}
                margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                layout="vertical"
              >
                <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                <XAxis type="number" tick={{ fill: theme.foreground }} />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  width={150}
                  tick={{ fill: theme.foreground, fontSize: 12 }}
                />
                <Tooltip 
                  formatter={(value, name) => {
                    if (name === 'spend' || name === 'revenue' || name === 'profit') {
                      return [`€${value.toFixed(2)}`, name.charAt(0).toUpperCase() + name.slice(1)];
                    }
                    return [value.toFixed(2), name.charAt(0).toUpperCase() + name.slice(1)];
                  }}
                  contentStyle={{ backgroundColor: theme.cardBackground, borderColor: theme.border, color: theme.foreground }}
                />
                <Legend wrapperStyle={{ color: theme.foreground }} />
                <Bar 
                  dataKey="spend" 
                  fill={theme.chart3} 
                  name="Ad Spend" 
                  animationDuration={1500} 
                />
                <Bar 
                  dataKey="revenue" 
                  fill={theme.chart1} 
                  name="Revenue" 
                  animationDuration={1500} 
                  animationBegin={150} 
                />
                <Bar 
                  dataKey="profit" 
                  name="Profit" 
                  animationDuration={1500} 
                  animationBegin={300}
                >
                  {prepareCampaignPerformance().map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.isTopCampaign ? theme.positive : theme.negative} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        {/* Campaign List */}
        <div 
          className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
          style={{ backgroundColor: theme.cardBackground, borderColor: theme.border }}
        >
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">All Campaigns</h3>
            <div className="flex space-x-2">
            </div>
          </div>
          {renderFilterUI()}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700" style={{ borderColor: theme.border }}>
                  <th className="py-2 px-4 text-left">Campaign</th>
                  <th className="py-2 px-4 text-right">Spend</th>
                  <th className="py-2 px-4 text-right">Revenue</th>
                  <th className="py-2 px-4 text-right">ROAS</th>
                  <th className="py-2 px-4 text-right">Profit</th>
                  <th className="py-2 px-4 text-right">Margin %</th>
                </tr>
              </thead>
              <tbody>
              {filteredData().map((campaign, index) => (
              <tr 
                key={index}
                className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                style={{ borderColor: theme.border }}
              >
                <td className="py-2 px-4">
                  <div className="truncate max-w-xs" title={campaign.campaignName}>
                    {campaign.URL ? (
                      <a 
                        href={campaign.URL} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline"
                      >
                        {campaign.campaignName}
                      </a>
                    ) : (
                      campaign.campaignName
                    )}
                  </div>
                </td>
                <td className="py-2 px-4 text-right">€{campaign['Ad Spend']?.toFixed(2)}</td>
                <td className="py-2 px-4 text-right">€{campaign['Total Revenue']?.toFixed(2)}</td>
                <td className="py-2 px-4 text-right" style={{ 
                  color: (campaign['Total ROAS'] || 0) >= 1 ? theme.positive : theme.negative 
                }}>
                  {campaign['Total ROAS']?.toFixed(2) || '0.00'}
                </td>
                <td className="py-2 px-4 text-right" style={{ 
                  color: (campaign['Total Net Profit'] || 0) >= 0 ? theme.positive : theme.negative 
                }}>
                  €{campaign['Total Net Profit']?.toFixed(2)}
                </td>
                <td className="py-2 px-4 text-right" style={{ 
                  color: (campaign['Total Profit Margin (%)'] || 0) >= 0 ? theme.positive : theme.negative 
                }}>
                  {campaign['Total Profit Margin (%)']?.toFixed(2) || '0.00'}%
                </td>
                <td className="py-2 px-4 text-center">
                  <button 
                    className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm"
                    onClick={() => showCampaignDetails(campaign)}
                  >
                    Details
                  </button>
                </td>
              </tr>
            ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };
  
  const renderProductsTab = () => {
    // Get product data and sort it according to the current sort settings
    const productData = prepareRevenueByProduct();
    // Apply sorting directly (no need for useMemo since this function runs on each render anyway)
    const sortedProductData = _.orderBy(productData, [productSortField], [productSortDirection]);
    
    // Function to handle column header clicks for sorting
    const handleSortClick = (field) => {
      if (productSortField === field) {
        // Toggle direction if clicking the same field
        setProductSortDirection(productSortDirection === 'asc' ? 'desc' : 'asc');
      } else {
        // Set new field and default to descending
        setProductSortField(field);
        setProductSortDirection('desc');
      }
    };
    
    // Helper to render sort indicator
    const renderSortIndicator = (field) => {
      if (productSortField !== field) return null;
      return productSortDirection === 'asc' ? '▲' : '▼';
    };
  
    return (
      <div className="space-y-6">
        {/* Add Date Selector at the top */}
        <div className="mb-4">
          {renderFilterUI()}
        </div>
        
        {/* Sorting options */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
          style={{ backgroundColor: theme.cardBackground, borderColor: theme.border }}>
          <h3 className="text-lg font-semibold mb-4">Product Sorting Options</h3>
          <div className="flex flex-wrap gap-2">
            <button
              className={`px-3 py-2 rounded-lg ${productSortField === 'revenue' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
              onClick={() => {
                setProductSortField('revenue');
                setProductSortDirection('desc');
              }}
            >
              Sort by Highest Revenue
            </button>
            <button
              className={`px-3 py-2 rounded-lg ${productSortField === 'orders' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
              onClick={() => {
                setProductSortField('orders');
                setProductSortDirection('desc');
              }}
            >
              Sort by Highest Sales Volume
            </button>
            <button
              className={`px-3 py-2 rounded-lg ${productSortField === 'profit' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
              onClick={() => {
                setProductSortField('profit');
                setProductSortDirection('desc');
              }}
            >
              Sort by Highest Profit
            </button>
            <button
              className={`px-3 py-2 rounded-lg ${productSortField === 'margin' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
              onClick={() => {
                setProductSortField('margin');
                setProductSortDirection('desc');
              }}
            >
              Sort by Highest Margin
            </button>
          </div>
        </div>
        
        {/* Product Performance Chart */}
        <div 
          className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
          style={{ backgroundColor: theme.cardBackground, borderColor: theme.border }}
        >
          <h3 className="text-lg font-semibold mb-4">Product Performance</h3>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart 
                data={sortedProductData}
                margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                <XAxis 
                  dataKey="name" 
                  angle={-45} 
                  textAnchor="end" 
                  height={70} 
                  tick={{ fill: theme.foreground, fontSize: 12 }}
                />
                <YAxis tick={{ fill: theme.foreground }} />
                <Tooltip 
                  formatter={(value, name) => {
                    if (name === 'revenue' || name === 'profit') {
                      return [`€${value.toFixed(2)}`, name.charAt(0).toUpperCase() + name.slice(1)];
                    }
                    return [value, name.charAt(0).toUpperCase() + name.slice(1)];
                  }}
                  contentStyle={{ backgroundColor: theme.cardBackground, borderColor: theme.border, color: theme.foreground }}
                />
                <Legend wrapperStyle={{ color: theme.foreground }} />
                <Area 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke={theme.chart1} 
                  fill={`${theme.chart1}80`} 
                  name="Revenue"
                  activeDot={{ r: 8 }}
                  animationDuration={1500}
                />
                <Area 
                  type="monotone" 
                  dataKey="profit" 
                  stroke={theme.chart4} 
                  fill={`${theme.chart4}80`} 
                  name="Profit"
                  activeDot={{ r: 6 }}
                  animationDuration={1500}
                  animationBegin={300}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        {/* Product List with sortable columns */}
        <div 
          className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
          style={{ backgroundColor: theme.cardBackground, borderColor: theme.border }}
        >
          <h3 className="text-lg font-semibold mb-4">Products by Performance</h3>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700" style={{ borderColor: theme.border }}>
                  <th 
                    className="py-2 px-4 text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => handleSortClick('name')}
                  >
                    Product {renderSortIndicator('name')}
                  </th>
                  <th 
                    className="py-2 px-4 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => handleSortClick('revenue')}
                  >
                    Revenue {renderSortIndicator('revenue')}
                  </th>
                  <th 
                    className="py-2 px-4 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => handleSortClick('orders')}
                  >
                    Sales Volume {renderSortIndicator('orders')}
                  </th>
                  <th 
                    className="py-2 px-4 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => handleSortClick('profit')}
                  >
                    Profit {renderSortIndicator('profit')}
                  </th>
                  <th 
                    className="py-2 px-4 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => handleSortClick('campaigns')}
                  >
                    Campaigns {renderSortIndicator('campaigns')}
                  </th>
                  <th 
                    className="py-2 px-4 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => handleSortClick('margin')}
                  >
                    Margin % {renderSortIndicator('margin')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedProductData.map((product, index) => (
                  <tr 
                    key={index}
                    className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                    style={{ borderColor: theme.border }}
                  >
                    <td className="py-2 px-4">
                      <div className="truncate max-w-xs">
                        {product.name}
                      </div>
                    </td>
                    <td className="py-2 px-4 text-right">€{product.revenue.toFixed(2)}</td>
                    <td className="py-2 px-4 text-right">{product.orders}</td>
                    <td className="py-2 px-4 text-right" style={{ 
                      color: product.profit >= 0 ? theme.positive : theme.negative 
                    }}>
                      €{product.profit.toFixed(2)}
                    </td>
                    <td className="py-2 px-4 text-right">{product.campaigns}</td>
                    <td className="py-2 px-4 text-right" style={{ 
                      color: product.margin >= 0 ? theme.positive : theme.negative 
                    }}>
                      {product.margin.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };
  
  

  const renderSettingsTab = () => {
  
    const applyDateRangeFilter = () => {
      // Ensure we have valid dates
      if (!customDateStart || !customDateEnd || isNaN(customDateStart.getTime()) || isNaN(customDateEnd.getTime())) {
        alert("Please select valid start and end dates");
        return;
      }
      
      // Temporarily disable the normal days filter
      setFilterDays(0);
      
      // Set a flag to indicate we're using custom dates
      setUseCustomDateRange(true);
      
      // Optionally switch to campaigns tab to show the filtered data
      setActiveTab('campaigns');
    };
    
    // Handle refreshing data
    const handleRefreshData = async () => {
      setIsRunningScript(true);
      setScriptLogs('Starting data refresh...\n');
      
      try {
        // Call the API to run the script
        const result = await onRunScript({
          daysBack: filterDays || 30,
          attributionWindow: attributionDays || 7,
          extendedAnalysis: 30,
          cogsPercentage: 0.4
        });
        
        // Update the logs with the script output
        setScriptLogs(prev => 
          prev + 
          `\nScript execution ${result.status}\n` +
          `Message: ${result.message}\n` +
          `\nScript output:\n${result.stdout || ''}\n` +
          `\nErrors (if any):\n${result.stderr || ''}\n` +
          `\nThis may include Facebook API rate limit errors, which are expected.`
        );
        
        // If successful, reload the data
        if (result.status === 'success') {
          setScriptLogs(prev => prev + '\nRefreshing dashboard with new data...\n');
          await loadData();
          setScriptLogs(prev => prev + 'Dashboard refresh complete!\n');
        }
      } catch (error) {
        setScriptLogs(prev => 
          prev + 
          `\nError running script: ${error.message}\n` +
          `Facebook API rate limits may have been exceeded. This is normal and expected.\n`
        );
      } finally {
        setIsRunningScript(false);
      }
    };
    
    // Handle auto-update toggle
    const handleAutoUpdateToggle = (enabled) => {
      setAutoUpdateEnabled(enabled);
      
      // Call the parent component function to toggle scheduled updates
      if (onToggleScheduledUpdates) {
        onToggleScheduledUpdates(enabled);
      }
      
      // Store the setting in localStorage
      localStorage.setItem('scheduled_updates', String(enabled));
    };
      
    return (
      <div className="space-y-6">
        <div 
          className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
          style={{ backgroundColor: theme.cardBackground, borderColor: theme.border }}
        >
          <h3 className="text-lg font-semibold mb-4">Dashboard Settings</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block mb-2 font-medium">Custom Date Range</label>
              <div className="space-y-3">
              <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Start Date</label>
              <input 
                type="date" 
                className="p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 w-full"
                value={customDateStart.toISOString().split('T')[0]}
                onChange={(e) => {
                  const date = new Date(e.target.value);
                  if (!isNaN(date.getTime())) {
                    setCustomDateStart(date);
                  }
                }}
                style={{ backgroundColor: theme.cardBackground, color: theme.foreground, borderColor: theme.border }}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">End Date</label>
              <input 
                type="date" 
                className="p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 w-full"
                value={customDateEnd.toISOString().split('T')[0]}
                onChange={(e) => {
                  const date = new Date(e.target.value);
                  if (!isNaN(date.getTime())) {
                    setCustomDateEnd(date);
                  }
                }}
                style={{ backgroundColor: theme.cardBackground, color: theme.foreground, borderColor: theme.border }}
              />
            </div>

            {!useCustomDateRange && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Matches current filter: {filterDays === 0 ? "All campaigns" : `Last ${filterDays} days`}
              </div>
            )}
                
                <button 
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded w-full"
                  onClick={applyDateRangeFilter}
                >
                  Apply Date Range
                </button>
                
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Filter campaigns that occur between these dates
                </div>
              </div>
            </div>
            
            <div>
              <label className="block mb-2 font-medium">Theme</label>
              <div className="flex space-x-2">
                <button
                  className={`flex-1 p-2 rounded ${!darkMode ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}
                  onClick={() => setDarkMode(false)}
                >
                  <div className="flex items-center justify-center space-x-2">
                    <Sun size={18} />
                    <span>Light</span>
                  </div>
                </button>
                
                <button
                  className={`flex-1 p-2 rounded ${darkMode ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}
                  onClick={() => setDarkMode(true)}
                >
                  <div className="flex items-center justify-center space-x-2">
                    <Moon size={18} />
                    <span>Dark</span>
                  </div>
                </button>
              </div>
              
              <div className="mt-6">
                <label className="block mb-2 font-medium">Data Update Settings</label>
                <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">Daily Automatic Update</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        Data will be refreshed once every 24 hours (enabled by default)
                      </div>
                    </div>
                    <div className="text-sm text-blue-500">
                      Active
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    Note: Auto-update is always enabled to ensure your data stays current
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Script logs section */}
          {scriptLogs && (
            <div className="mt-6">
              <label className="block mb-2 font-medium">Script Execution Logs</label>
              <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded h-60 overflow-y-auto">
                <pre className="text-xs font-mono whitespace-pre-wrap" style={{ color: theme.foreground }}>
                  {scriptLogs}
                </pre>
              </div>
            </div>
          )}
          
          <div className="mt-6 flex justify-end">
            <div className="flex space-x-2">
              <button
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded flex items-center space-x-2"
                onClick={downloadCSV}
                style={{ backgroundColor: `${theme.neutral}20`, color: theme.foreground }}
              >
                <Download size={18} />
                <span>Export CSV</span>
              </button>
              
              <button
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded flex items-center space-x-2"
                onClick={handleRefreshData}
                disabled={isRunningScript}
              >
                {isRunningScript ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                    <span>Running Script...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={18} />
                    <span>Refresh Data</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };
  
  const applyCustomDateFilter = (startDate, endDate) => {
    // Temporarily disable the normal days filter
    setFilterDays(0);
    
    // Set custom date range for filtering
    // We'll need to use these in a modified version of the filterDataByDays function
    setCustomDateStart(startDate);
    setCustomDateEnd(endDate);
    
    // Set a flag to indicate we're using custom dates
    setUseCustomDateRange(true);
    
    // Optionally switch to campaigns tab to show the filtered data
    setActiveTab('campaigns');
  };
  
  const renderAIInsightsTab = () => {
    return (
      <div className="space-y-6">
        {/* Add Date Selector at the top */}
        <div className="mb-4">
          {renderFilterUI()}
        </div>
        <div 
          className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
          style={{ backgroundColor: theme.cardBackground, borderColor: theme.border }}
        >
          <h3 className="text-lg font-semibold mb-4">AI Campaign Data Assistant</h3>
          
          <div className="flex flex-col space-y-4">
            {/* Chat messages display */}
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 h-96 overflow-y-auto flex flex-col space-y-4">
              {chatMessages.length === 0 ? (
                <div className="text-center text-gray-500 dark:text-gray-400 my-auto">
                  <div className="mb-3">
                    <Zap size={40} className="mx-auto opacity-50" />
                  </div>
                  <p className="text-lg mb-2">Ask me anything about your campaign data</p>
                  <p className="text-sm">
                    Example questions:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3 max-w-2xl mx-auto">
                    {[
                      "Which campaigns have the highest ROAS?",
                      "What's my overall profit margin?",
                      "Which products are performing best?",
                      "What should I do with my underperforming campaigns?",
                      "How has my ad spend efficiency changed?",
                      "What's my conversion rate across campaigns?"
                    ].map((q, i) => (
                      <button 
                        key={i}
                        className="text-left p-2 bg-purple-100 dark:bg-purple-900/30 rounded hover:bg-purple-200 dark:hover:bg-purple-800/30 text-sm"
                        onClick={() => setChatInput(q)}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {chatMessages.map((msg, index) => (
                    <div 
                      key={index} 
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div 
                        className={`max-w-3/4 p-3 rounded-lg ${
                          msg.role === 'user' 
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-100 rounded-br-none' 
                            : msg.isError 
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-100 rounded-bl-none'
                              : 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-100 rounded-bl-none'
                        }`}
                      >
                        <div className="whitespace-pre-line">{msg.content}</div>
                        {msg.role === 'assistant' && msg.model && !msg.isError && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {msg.model} · {new Date(msg.timestamp).toLocaleTimeString()}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {isChatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-purple-100 dark:bg-purple-900/30 p-3 rounded-lg rounded-bl-none">
                        <div className="flex space-x-2">
                          <div className="h-2 w-2 bg-purple-500 rounded-full animate-bounce"></div>
                          <div className="h-2 w-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                          <div className="h-2 w-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            
            {/* Chat input form */}
            <form onSubmit={handleChatSubmit} className="flex space-x-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about your campaign data..."
                className="flex-1 p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                style={{ backgroundColor: theme.cardBackground, color: theme.foreground, borderColor: theme.border }}
                disabled={isChatLoading}
              />
              <button
                type="submit"
                className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg flex items-center"
                disabled={isChatLoading || !chatInput.trim()}
              >
                {isChatLoading ? (
                  <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                ) : (
                  <Zap size={18} />
                )}
              </button>
            </form>
          </div>
        </div>
        
        {/* Keep the existing Campaign Optimization Suggestions section */}
        <div 
          className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
          style={{ backgroundColor: theme.cardBackground, borderColor: theme.border }}
        >
          <h3 className="text-lg font-semibold mb-4">Campaign Optimization Suggestions</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-800">
              <h4 className="text-green-800 dark:text-green-300 text-md font-medium mb-2">Top Campaigns to Scale</h4>
              <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">These campaigns have the highest return on ad spend</p>
              
              <ul className="space-y-2">
                {topCampaigns().slice(0, 3).map((campaign, index) => (
                  <li 
                    key={index}
                    className="p-2 bg-white dark:bg-gray-800 rounded border border-green-100 dark:border-green-700 flex justify-between items-center cursor-pointer hover:bg-green-50 dark:hover:bg-green-900/20"
                    onClick={() => showCampaignDetails(campaign)}
                  >
                    <div className="truncate mr-2" style={{ maxWidth: '200px' }}>
                      {campaign.campaignName || campaign[''] || 'Unknown Campaign'}
                    </div>
                    <div className="text-green-600 dark:text-green-400 font-medium">
                      ROAS: {campaign['Total ROAS']?.toFixed(2) || 'N/A'}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-800">
              <h4 className="text-red-800 dark:text-red-300 text-md font-medium mb-2">Campaigns to Optimize</h4>
              <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">These campaigns are underperforming and need attention</p>
              
              <ul className="space-y-2">
                {worstCampaigns().slice(0, 3).map((campaign, index) => (
                  <li 
                    key={index}
                    className="p-2 bg-white dark:bg-gray-800 rounded border border-red-100 dark:border-red-700 flex justify-between items-center cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/20"
                    onClick={() => showCampaignDetails(campaign)}
                  >
                    <div className="truncate mr-2" style={{ maxWidth: '200px' }}>
                      {campaign.campaignName || campaign[''] || 'Unknown Campaign'}
                    </div>
                    <div className="text-red-600 dark:text-red-400 font-medium">
                      ROAS: {campaign['Total ROAS']?.toFixed(2) || 'N/A'}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  };
  
// Main render function
return (
    <div 
      className="min-h-screen p-4 md:p-6"
      style={{ backgroundColor: theme.background, color: theme.foreground }}
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-1">E-commerce Campaign Dashboard</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Last updated: {lastUpdated.toLocaleString()}
          </p>
        </div>
        
        <div className="flex space-x-2 mt-4 md:mt-0">
          <button
            className="p-2 rounded-lg bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
            onClick={() => setDarkMode(!darkMode)}
            title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          
          <button
            className="p-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white"
            onClick={loadData}
            title="Refresh Data"
          >
            <RefreshCw size={20} />
          </button>
          
          <button
            className="p-2 rounded-lg bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
            onClick={downloadCSV}
            title="Download CSV"
          >
            <Download size={20} />
          </button>
        </div>
      </div>
      
      {/* Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm" style={{ backgroundColor: theme.cardBackground }}>
            <div className="flex flex-col items-center">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
              <p className="text-lg font-medium">Loading data...</p>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">This may take a few moments</p>
            </div>
          </div>
        </div>
      )}
      
      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200 dark:border-gray-700" style={{ borderColor: theme.border }}>
        <div className="flex overflow-x-auto">
          {[
            { id: 'overview', label: 'Overview', icon: <Home size={18} /> },
            { id: 'campaigns', label: 'Campaigns', icon: <BarChart2 size={18} /> },
            { id: 'products', label: 'Products', icon: <PieChartIcon size={18} /> },
            { id: 'ai-insights', label: 'AI Insights', icon: <Zap size={18} /> },
            { id: 'settings', label: 'Settings', icon: <Settings size={18} /> }
          ].map(tab => (
            <button
              key={tab.id}
              className={`flex items-center space-x-2 px-4 py-2 border-b-2 font-medium text-sm focus:outline-none transition ${
                activeTab === tab.id 
                  ? `border-blue-500 text-blue-500 dark:text-blue-400` 
                  : `border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-700`
              }`}
              onClick={() => setActiveTab(tab.id)}
              style={{ 
                borderColor: activeTab === tab.id ? theme.primary : 'transparent',
                color: activeTab === tab.id ? theme.primary : undefined
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
      
      {/* Tab Content */}
      <div>
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'campaigns' && renderCampaignsTab()}
        {activeTab === 'products' && renderProductsTab()}
        {activeTab === 'ai-insights' && renderAIInsightsTab()}
        {activeTab === 'settings' && renderSettingsTab()}
      </div>
      
      {/* Campaign Modal */}
      <CampaignModal />
    </div>
  );
};

export default EcommerceDashboard;