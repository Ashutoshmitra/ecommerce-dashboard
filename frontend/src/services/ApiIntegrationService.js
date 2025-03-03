// frontend/src/services/ApiIntegrationService.js
import AnthropicService from './AnthropicService';

class ApiIntegrationService {
  constructor() {
    this.anthropicService = new AnthropicService();
    
    // Dynamically determine the base URL instead of hardcoding localhost
    this.baseUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://localhost:5001'  // Use localhost in development
      : '';  // In production, use relative URLs to same domain
    
    this.isScheduled = false;
    this.scheduledUpdateInterval = 24 * 60 * 60 * 1000; // 24 hours
    this.updateTimer = null;
    
    // Initialize by fetching API key
    this.fetchApiKey();
  }

  /**
   * Fetch API key from the server
   */
  async fetchApiKey() {
    try {
      console.log('Fetching API key from:', `${this.baseUrl}/api/anthropic-key`);
      
      // Add a timeout to the fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(`${this.baseUrl}/api/anthropic-key`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId); // Clear the timeout
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API key fetch failed:', errorText);
        throw new Error(`API key fetch failed: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.apiKey) {
        console.log('API key fetched successfully');
        this.anthropicService.setApiKey(data.apiKey);
        return true;
      }
      
      console.warn('API key not found in response:', data);
      return false;
    } catch (error) {
      // Check if it's an abort error (timeout)
      if (error.name === 'AbortError') {
        console.error('API key fetch timed out. Check if the backend server is running.');
      } else {
        console.error('Error fetching API key:', error);
      }
      
      return false;
    }
  }

  /**
   * Get the latest data file path
   * 
   * @returns {Promise<Object>} - Latest data file information
   */
  async getLatestDataFile() {
    try {
      console.log('Fetching latest data file from:', `${this.baseUrl}/api/latest-data`);
      const response = await fetch(`${this.baseUrl}/api/latest-data`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to get latest data: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error getting latest data file:', error);
      throw error;
    }
  }

  /**
   * Fetch CSV data from the server
   * 
   * @param {string} fileName - Name of the CSV file to fetch
   * @returns {Promise<string>} - CSV content as string
   */
  async fetchCSVData(fileName) {
    try {
      console.log('Fetching CSV data:', fileName);
      // If no filename provided, get the latest data file
      if (!fileName) {
        const latestData = await this.getLatestDataFile();
        fileName = latestData.file;
      }

      const response = await fetch(`${this.baseUrl}/data/${fileName}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'text/csv',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch CSV data: ${response.status} ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      console.error('Error fetching CSV data:', error);
      throw error;
    }
  }

/**
 * Run the analysis script
 * 
 * @param {Object} params - Script parameters
 * @returns {Promise<Object>} - Result of the script execution
 */
async runAnalysisScript(params = {}) {
  try {
    console.log('Running analysis script with params:', params);
    
    // Set a longer timeout for this request as script execution can take time
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
    
    const response = await fetch(`${this.baseUrl}/api/run-script`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params || {
        daysBack: 30,
        attributionWindow: 7,
        extendedAnalysis: 30,
        cogsPercentage: 0.4
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId); // Clear the timeout

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Script execution failed:', errorText);
      throw new Error(`Script execution failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    
    // Log Facebook rate limit warnings if they exist in stdout/stderr
    if (result.stdout && result.stdout.includes('rate limit')) {
      console.warn('Facebook API rate limit warning detected in script output');
    }
    
    if (result.stderr && result.stderr.includes('rate limit')) {
      console.warn('Facebook API rate limit error detected in script output');
    }
    
    return result;
  } catch (error) {
    console.error('Error running analysis script:', error);
    
    // Check if it's an abort error (timeout)
    if (error.name === 'AbortError') {
      throw new Error('Script execution timed out. The operation may have been too resource-intensive or there may be network issues.');
    }
    
    // For rate limit errors, provide a more helpful message
    if (error.message && error.message.toLowerCase().includes('rate limit')) {
      throw new Error('Facebook API rate limit exceeded. Please try again later.');
    }
    
    throw error;
  }
}


  /**
   * Schedule automatic updates
   * 
   * @param {boolean} enabled - Whether to enable scheduled updates
   * @param {Function} callback - Callback function after update
   * @returns {boolean} - Success status
   */
  scheduleUpdates(enabled, callback, runNow = false) {
    // Clear any existing timer
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
      this.isScheduled = false;
    }

    // If enabled, set a new timer
    if (enabled) {
      this.isScheduled = true;
      console.log('Scheduling updates every 24 hours');
      
      // Run immediately once
      if (runNow) {
        this.runAnalysisScript()
          .then(result => {
            if (callback && typeof callback === 'function') {
              callback(result);
            }
          })
          .catch(error => {
            console.error('Error in initial scheduled update:', error);
            if (callback && typeof callback === 'function') {
              callback({
                status: 'error',
                message: `Error in scheduled update: ${error.message}`
              });
            }
          });
        }
      // Run every 24 hours
      this.updateTimer = setInterval(async () => {
        try {
          const result = await this.runAnalysisScript();
          if (callback && typeof callback === 'function') {
            callback(result);
          }
        } catch (error) {
          console.error('Error in scheduled update:', error);
          if (callback && typeof callback === 'function') {
            callback({
              status: 'error',
              message: `Error in scheduled update: ${error.message}`
            });
          }
        }
      }, this.scheduledUpdateInterval);
    }

    return true;
  }

// Add this method to ApiIntegrationService.js
// Place it after the fetchApiKey method

/**
 * Process chat message through backend proxy to avoid CORS issues
 * 
 * @param {Object} context - Chat context with question and data
 * @returns {Promise<Object>} - The AI response
 */
async processChat(context) {
  try {
    console.log('Processing chat through backend proxy');
    
    // Make the request to your backend proxy endpoint instead of directly to Anthropic
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json' // Add Accept header
      },
      body: JSON.stringify({
        question: context.question,
        dashboardData: context.dashboardData
      })
    });
    
    // Apply this pattern to all fetch calls in the class
    
    // Add more error handling
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Response error:', errorText);
      throw new Error(`Chat request failed: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error processing chat:', error);
    
    // Fall back to the local simulated response if backend fails
    return this.anthropicService.generateSimulatedChatResponse(context);
  }
}

/**
 * Generate campaign insights using AI via backend proxy
 * 
 * @param {Object} campaign - Campaign data
 * @returns {Promise<Object>} - AI insights
 */
async generateCampaignInsightsViaProxy(campaign = null) {
  try {
    console.log('Generating insights via backend proxy for campaign:', campaign ? campaign.campaignName : 'All campaigns');
    
    // If no campaign provided, generate dashboard insights instead
    if (!campaign) {
      return this.generateDashboardInsightsViaProxy();
    }
    
    // Prepare the campaign summary
    const campaignSummary = this.anthropicService.prepareCampaignSummary(campaign);
    
    // Make the request to your backend proxy endpoint
    const response = await fetch(`${this.baseUrl}/api/campaign-insights`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        campaign: campaignSummary
      })
    });
    
    if (!response.ok) {
      throw new Error(`Campaign insights request failed: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error generating campaign insights via proxy:', error);
    
    // Fall back to the simulated insights
    return this.anthropicService.generateSimulatedCampaignInsights(campaign);
  }
}

/**
 * Generate dashboard insights using AI via backend proxy
 * 
 * @param {Array} allCampaignsData - All campaigns data (optional)
 * @returns {Promise<Object>} - AI insights
 */
async generateDashboardInsightsViaProxy(allCampaignsData = null) {
  try {
    console.log('Generating dashboard insights via backend proxy');
    
    // Use provided data or get data from state
    const campaigns = allCampaignsData || this.data || [];
    
    // Prepare the dashboard summary
    const dashboardSummary = this.anthropicService.prepareDashboardSummary(campaigns);
    
    // Make the request to your backend proxy endpoint
    const response = await fetch(`${this.baseUrl}/api/dashboard-insights`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dashboard: dashboardSummary
      })
    });
    
    if (!response.ok) {
      throw new Error(`Dashboard insights request failed: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error generating dashboard insights via proxy:', error);
    
    // Fall back to the simulated insights
    return this.anthropicService.generateSimulatedDashboardInsights(allCampaignsData || []);
  }
}

/**
 * Generate campaign insights using AI
 * 
 * @param {Object} campaign - Campaign data
 * @returns {Promise<Object>} - AI insights
 */
async generateCampaignInsights(campaign = null) {
  try {
    console.log('Generating insights for campaign:', campaign ? campaign.campaignName : 'All campaigns');
    
    // Try to use the proxy method first to avoid CORS issues
    return await this.generateCampaignInsightsViaProxy(campaign);
  } catch (error) {
    console.error('Error with proxy, falling back to direct API call:', error);
    
    // Check if we have a valid API key
    if (!this.anthropicService.apiKey) {
      await this.fetchApiKey();
    }
    
    if (campaign) {
      return await this.anthropicService.generateCampaignInsights(campaign);
    } else {
      // Fallback to simulated insights if API key is missing or for testing
      const insight = `This campaign is showing strong performance with a ROAS of ${campaign ? campaign['Total ROAS']?.toFixed(2) : '2.56'}. 
      Based on the data, you should consider increasing the budget allocation by 15-20% to scale this campaign.
      Focus on optimizing the targeting to improve conversion rates further.`;
      
      return { 
        insight, 
        model: "Simulated AI", 
        id: "sim-" + Date.now() 
      };
    }
  }
}


/**
 * Generate dashboard insights
 * 
 * @param {Array} allCampaignsData - All campaigns data
 * @returns {Promise<Object>} - AI insights
 */
async generateDashboardInsights(allCampaignsData = []) {
  try {
    console.log('Generating dashboard insights for all campaigns');
    
    // Try to use the proxy method first to avoid CORS issues
    return await this.generateDashboardInsightsViaProxy(allCampaignsData);
  } catch (error) {
    console.error('Error with proxy, falling back to direct API call:', error);
    
    // Check if we have a valid API key
    if (!this.anthropicService.apiKey) {
      await this.fetchApiKey();
    }
    
    if (this.anthropicService.apiKey) {
      return await this.anthropicService.generateDashboardInsights(allCampaignsData);
    } else {
      // Fallback to simulated insights
      const insight = `Your e-commerce campaigns are performing well overall with an average ROAS of 2.47. 
      7 out of 8 campaigns are profitable, representing 87.5% of your portfolio. 
      Your top performing campaign is "18 MAR - C28 ADS Collection" with a ROAS of 3.17 and net profit of $2,150.
      Consider reallocating budget from your underperforming "03 APR - Casual Jeans" campaign to your top performers.`;
      
      return { 
        insight, 
        model: "Simulated AI", 
        id: "sim-" + Date.now() 
      };
    }
  }
}
}
export default ApiIntegrationService;