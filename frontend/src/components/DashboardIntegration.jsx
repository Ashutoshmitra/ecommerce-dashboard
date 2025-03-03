// frontend/src/components/DashboardIntegration.jsx
import React, { useState, useEffect } from 'react';
import EcommerceDashboard from './EcommerceDashboard';
import ApiIntegrationService from '../services/ApiIntegrationService';

// Main dashboard wrapper component that integrates all features
const DashboardIntegration = () => {
  // State variables
  const [apiService] = useState(new ApiIntegrationService());
  const [initializing, setInitializing] = useState(true);
  const [dataUpdateStatus, setDataUpdateStatus] = useState(null);
  
  // Component initialization
  useEffect(() => {
    setInitializing(false);
    
    // Always enable scheduled updates by default
    const scheduledUpdates = localStorage.getItem('scheduled_updates') !== 'true';
    apiService.scheduleUpdates(true, handleScheduledUpdate);
  }, [apiService]);
  
  // Handle scheduled update callback
  const handleScheduledUpdate = (result) => {
    setDataUpdateStatus({
      time: new Date(),
      success: result.status === 'success',
      message: result.message,
      filePath: result.output_file,
      stdout: result.stdout,
      stderr: result.stderr
    });
  };
  
  // Toggle scheduled updates
  const toggleScheduledUpdates = (enabled) => {
    const result = apiService.scheduleUpdates(enabled, handleScheduledUpdate);
    localStorage.setItem('scheduled_updates', String(enabled));
    
    setDataUpdateStatus({
      time: new Date(),
      success: true,
      message: enabled ? 'Scheduled updates enabled' : 'Scheduled updates disabled'
    });
    
    return result;
  };
  
  // Run script manually
  const runScript = async (params) => {
    setDataUpdateStatus({
      time: new Date(),
      success: null,
      message: 'Running analysis script...'
    });
    
    try {
      const result = await apiService.runAnalysisScript(params);
      
      setDataUpdateStatus({
        time: new Date(),
        success: result.status === 'success',
        message: result.message,
        filePath: result.output_file,
        stdout: result.stdout,
        stderr: result.stderr
      });
      
      return result;
    } catch (error) {
      setDataUpdateStatus({
        time: new Date(),
        success: false,
        message: `Error: ${error.message}`
      });
      
      throw error;
    }
  };
  
  // Generate AI insights for campaign or dashboard
  const generateInsights = async (campaign = null) => {
    try {
      if (campaign) {
        return await apiService.generateCampaignInsights(campaign);
      } else {
        return await apiService.generateDashboardInsights();
      }
    } catch (error) {
      console.error('Error generating insights:', error);
      return {
        insight: `Error generating insights: ${error.message}. Please check your API configuration.`,
        model: "Error",
        id: "error-" + Date.now()
      };
    }
  };
  
  // Main render
  if (initializing) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  return (
    <div>
      <EcommerceDashboard 
        apiService={apiService}
        onRunScript={runScript}
        onToggleScheduledUpdates={toggleScheduledUpdates}
        onGenerateInsights={generateInsights}
        updateStatus={dataUpdateStatus}
      />
    </div>
  );
};

export default DashboardIntegration;