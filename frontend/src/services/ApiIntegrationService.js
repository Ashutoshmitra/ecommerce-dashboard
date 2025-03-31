// frontend/src/services/ApiIntegrationService.js

class ApiIntegrationService {
  constructor() {
    // Dynamically determine the base URL instead of hardcoding localhost
    this.baseUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://localhost:5001'  // Use localhost in development
      : '';  // In production, use relative URLs to same domain
    
    this.isScheduled = false;
    this.scheduledUpdateInterval = 24 * 60 * 60 * 1000; // 24 hours
    this.updateTimer = null;
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
      
      // Read the JSON only once and store it
      const data = await response.json();
      
      // Now you can log it and return it
      console.log('Latest data file response:', data);
      
      return data;
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
        console.log('Latest file name received:', fileName);
      }
  
      // Log the full URL being used
      const url = `${this.baseUrl}/data/${fileName}`;
      console.log('Fetching from URL:', url);
  
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'text/csv',
        },
      });
      
      if (!response.ok) {
        console.error(`Error fetching CSV: Status ${response.status} - ${response.statusText}`);
        const errorText = await response.text();
        console.error('Error details:', errorText);
        throw new Error(`Failed to fetch CSV data: ${response.status} ${response.statusText}`);
      }
  
      const csvText = await response.text();
      console.log('CSV data received, first 100 chars:', csvText.substring(0, 100));
      return csvText;
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

  /**
   * Process chat message through backend proxy to avoid CORS issues
   * 
   * @param {Object} context - Chat context with question and data
   * @returns {Promise<Object>} - The AI response
   */
// Find the processChat method (around line 200-240) and replace it with:
async processChat(context) {
  try {
    console.log('Processing chat through backend proxy');
    
    const { dashboardData, question } = context;
    
    // Compress the data and limit to first 200 campaigns
    let compressedData = { ...dashboardData };
    
    // If allCampaigns exists, compress each campaign to essential fields only
    // and limit to first 200 campaigns
    if (compressedData.allCampaigns && compressedData.allCampaigns.length > 0) {
      console.log(`Compressing ${compressedData.allCampaigns.length} campaigns`);
      
      compressedData.allCampaigns = compressedData.allCampaigns
        .slice(0, 200) // Limit to first 200 campaigns
        .map(campaign => ({
          name: campaign.name || 'Unknown',
          product: campaign.product || 'Unknown',
          adSpend: campaign.adSpend || 0,
          revenue: campaign.revenue || 0,
          profit: campaign.profit || 0,
          roas: campaign.roas || 0,
          orders: campaign.orders || 0,
          conversionRate: campaign.conversionRate || 0
        }));
    }
    
    // Make the request to your backend proxy endpoint
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        question: question,
        dashboardData: compressedData
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Response error:', errorText);
      throw new Error(`Chat request failed: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error processing chat:', error);
    
    // Fallback for error cases
    return this.generateSimulatedChatResponse(context);
  }
}

  /**
   * Generate campaign insights using AI via backend proxy
   * 
   * @param {Object} campaign - Campaign data
   * @returns {Promise<Object>} - AI insights
   */
  async generateCampaignInsights(campaign = null) {
    try {
      console.log('Generating insights via backend proxy for campaign:', campaign ? campaign.campaignName : 'All campaigns');
      
      // If no campaign provided, generate dashboard insights instead
      if (!campaign) {
        return this.generateDashboardInsights();
      }
      
      // Make the request to your backend proxy endpoint
      const response = await fetch(`${this.baseUrl}/api/campaign-insights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          campaign: this.prepareCampaignSummary(campaign)
        })
      });
      
      if (!response.ok) {
        throw new Error(`Campaign insights request failed: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error generating campaign insights via proxy:', error);
      
      // Fall back to simulated insights
      return this.generateSimulatedCampaignInsights(campaign);
    }
  }

  /**
   * Generate dashboard insights using AI via backend proxy
   * 
   * @param {Array} allCampaignsData - All campaigns data (optional)
   * @returns {Promise<Object>} - AI insights
   */
  async generateDashboardInsights(allCampaignsData = null) {
    try {
      console.log('Generating dashboard insights via backend proxy');
      
      // Use provided data or get data from state
      const campaigns = allCampaignsData || this.data || [];
      
      // Make the request to your backend proxy endpoint
      const response = await fetch(`${this.baseUrl}/api/dashboard-insights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dashboard: this.prepareDashboardSummary(campaigns)
        })
      });
      
      if (!response.ok) {
        throw new Error(`Dashboard insights request failed: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error generating dashboard insights via proxy:', error);
      
      // Fall back to the simulated insights
      return this.generateSimulatedDashboardInsights(allCampaignsData || []);
    }
  }

  /* Simulated response and data preparation methods */

  /**
   * Prepare a simplified summary of campaign data for the API
   * @param {Object} campaign - The full campaign data
   * @returns {Object} - Simplified campaign summary
   */
  prepareCampaignSummary(campaign) {
    return {
      campaignName: campaign.campaignName || campaign[''] || 'Unknown Campaign',
      product: campaign['Product Name'],
      period: {
        start: campaign['Campaign Start'],
        end: campaign['Campaign End']
      },
      financials: {
        adSpend: campaign['Ad Spend'],
        revenue: campaign['Total Revenue'],
        profit: campaign['Total Net Profit'],
        roas: campaign['Total ROAS'],
        profitMargin: campaign['Total Profit Margin (%)']
      },
      performance: {
        impressions: campaign['Impressions'],
        clicks: campaign['Clicks'],
        ctr: campaign['CTR (%)'],
        conversionRate: campaign['Conversion Rate (%)'],
        orders: campaign['Total Orders'],
        cpa: campaign['CPA']
      }
    };
  }
  
  /**
   * Prepare dashboard summary for API
   * @param {Object[]} allCampaignsData - All campaigns data
   * @returns {Object} - Dashboard summary
   */
  prepareDashboardSummary(allCampaignsData) {
    if (!Array.isArray(allCampaignsData) || allCampaignsData.length === 0) {
      return { 
        error: "No campaign data available",
        campaignsCount: 0
      };
    }
    
    const totalCampaigns = allCampaignsData.length;
    const profitableCampaigns = allCampaignsData.filter(c => (c['Total Net Profit'] || 0) > 0).length;
    const totalSpend = allCampaignsData.reduce((sum, c) => sum + (c['Ad Spend'] || 0), 0);
    const totalRevenue = allCampaignsData.reduce((sum, c) => sum + (c['Total Revenue'] || 0), 0);
    const totalProfit = allCampaignsData.reduce((sum, c) => sum + (c['Total Net Profit'] || 0), 0);
    
    // Sort campaigns by performance
    const sortedByProfit = [...allCampaignsData]
      .sort((a, b) => (b['Total Net Profit'] || 0) - (a['Total Net Profit'] || 0));
    
    const topCampaigns = sortedByProfit.slice(0, 3).map(c => ({
      name: c.campaignName || c[''] || 'Unknown',
      product: c['Product Name'],
      spend: c['Ad Spend'],
      revenue: c['Total Revenue'],
      profit: c['Total Net Profit'],
      roas: c['Total ROAS']
    }));
    
    const worstCampaigns = sortedByProfit.slice(-3).map(c => ({
      name: c.campaignName || c[''] || 'Unknown',
      product: c['Product Name'],
      spend: c['Ad Spend'],
      revenue: c['Total Revenue'],
      profit: c['Total Net Profit'],
      roas: c['Total ROAS']
    }));
    
    return {
      overview: {
        totalCampaigns,
        profitableCampaigns,
        unprofitableCampaigns: totalCampaigns - profitableCampaigns,
        profitablePercentage: (profitableCampaigns / totalCampaigns * 100).toFixed(2),
        totalSpend: totalSpend.toFixed(2),
        totalRevenue: totalRevenue.toFixed(2),
        totalProfit: totalProfit.toFixed(2),
        overallROAS: (totalRevenue / totalSpend).toFixed(2)
      },
      topCampaigns,
      worstCampaigns
    };
  }

  /**
   * Generate simulated chat response when API is unavailable
   * 
   * @param {Object} context - The chat context
   * @returns {Object} - Simulated response
   */
  generateSimulatedChatResponse(context) {
    console.log('Generating simulated chat response');
    
    // Add defensive coding with fallbacks
    const { question, dashboardData = {} } = context || {};
    const lowerQuestion = (question || '').toLowerCase();
    
    // Extract key metrics with safeguards
    const metrics = dashboardData?.metrics || {};
    const avgRoas = metrics.avgROAS || 0;
    const totalProfit = metrics.totalProfit || 0;
    const profitableCampaignsCount = metrics.profitableCampaigns || 0;
    const totalCampaignsCount = metrics.totalCampaigns || 0;
    const profitablePercentage = totalCampaignsCount > 0 
      ? ((profitableCampaignsCount / totalCampaignsCount) * 100).toFixed(1) 
      : '0.0';
    
    // Make sure we have default values for totalSpend and totalRevenue
    const totalSpend = dashboardData?.totalSpend || 0;
    const totalRevenue = dashboardData?.totalRevenue || 0;
    
    // Determine which metrics to focus on based on the question
    let response = '';
    
    if (lowerQuestion.includes('roas') || lowerQuestion.includes('return on ad spend')) {
      response = `Your overall ROAS is ${avgRoas.toFixed(2)}. `;
      response += avgRoas >= 2 
        ? 'This is excellent! A ROAS above 2 is generally considered very good for e-commerce.'
        : avgRoas >= 1 
          ? 'This is break-even or slightly profitable. You should look for opportunities to optimize your campaigns.'
          : 'This is below the break-even point. I recommend reviewing your targeting, creative elements, and possibly pausing some underperforming campaigns.';
    } 
    else if (lowerQuestion.includes('profit') || lowerQuestion.includes('profitable')) {
      response = `Your campaigns have generated $${totalProfit.toFixed(2)} in total net profit. `;
      response += `${profitableCampaignsCount} out of ${totalCampaignsCount} campaigns (${profitablePercentage}%) are profitable. `;
      response += totalProfit > 0 
        ? 'Overall, your campaign strategy is working well.'
        : 'You may want to reconsider your campaign strategy to improve profitability.';
    }
    else if (lowerQuestion.includes('top') || lowerQuestion.includes('best') || lowerQuestion.includes('highest')) {
      const topCampaigns = dashboardData.topCampaigns || [];
      if (topCampaigns.length > 0) {
        const top = topCampaigns[0];
        response = `Your top performing campaign is "${top.campaignName || top[''] || 'Unknown'}" with a ROAS of ${(top['Total ROAS'] || 0).toFixed(2)} and profit of $${(top['Total Net Profit'] || 0).toFixed(2)}. `;
        response += 'Consider increasing the budget for this campaign to scale its success.';
      } else {
        response = 'I don\'t have specific information about your top campaigns in the provided data.';
      }
    }
    else if (lowerQuestion.includes('worst') || lowerQuestion.includes('bottom') || lowerQuestion.includes('underperforming')) {
      const worstCampaigns = dashboardData.worstCampaigns || [];
      if (worstCampaigns.length > 0) {
        const worst = worstCampaigns[0];
        response = `Your worst performing campaign is "${worst.campaignName || worst[''] || 'Unknown'}" with a ROAS of ${(worst['Total ROAS'] || 0).toFixed(2)} and ${(worst['Total Net Profit'] || 0) < 0 ? 'loss' : 'profit'} of $${Math.abs(worst['Total Net Profit'] || 0).toFixed(2)}. `;
        response += (worst['Total Net Profit'] || 0) < 0 
          ? 'You should consider pausing this campaign or significantly revising its targeting and creative elements.'
          : 'While this is your lowest performer, it\'s still generating profit. You might want to review it for optimization opportunities.';
      } else {
        response = 'I don\'t have specific information about your worst campaigns in the provided data.';
      }
    }
    else if (lowerQuestion.includes('product') || lowerQuestion.includes('products')) {
      const productData = dashboardData.revenueByProduct || [];
      if (productData.length > 0) {
        const topProduct = productData[0];
        response = `Your best performing product is "${topProduct.name}" with $${topProduct.revenue.toFixed(2)} in revenue and $${topProduct.profit.toFixed(2)} in profit. `;
        response += 'Consider featuring this product more prominently in your campaigns.';
      } else {
        response = 'I don\'t have specific information about product performance in the provided data.';
      }
    }
    else if (lowerQuestion.includes('recommend') || lowerQuestion.includes('suggestion') || lowerQuestion.includes('advice')) {
      response = 'Based on your data, here are my recommendations:\n\n';
      response += avgRoas >= 1 
        ? '1. Scale your top performing campaigns by increasing their budget by 15-20%.\n'
        : '1. Focus on improving your overall ROAS which is currently below break-even.\n';
      response += profitableCampaignsCount < totalCampaignsCount 
        ? `2. Consider pausing your worst performing campaigns that are showing consistent losses.\n`
        : '2. All your campaigns are profitable - great job! Look for optimization opportunities to further improve returns.\n';
      response += '3. Regularly test new ad creatives and audiences to find better performing combinations.';
    }
    else {
      response = `Based on your data for the period covering ${dashboardData.dateRange || 'the selected timeframe'}, `;
      response += `you have ${totalCampaignsCount} campaigns with a total ad spend of $${dashboardData.totalSpend?.toFixed(2) || '0.00'}, `;
      response += `generating $${dashboardData.totalRevenue?.toFixed(2) || '0.00'} in revenue. `;
      response += `Your overall ROAS is ${avgRoas.toFixed(2)} and your total profit is $${totalProfit.toFixed(2)}. `;
      response += `${profitableCampaignsCount} out of ${totalCampaignsCount} campaigns (${profitablePercentage}%) are profitable.`;
    }
    
    return {
      insight: response,
      model: "Simulated AI Assistant",
      id: "sim-" + Date.now()
    };
  }

  /**
   * Generate simulated campaign insights when API is unavailable
   * 
   * @param {Object} campaign - Campaign data
   * @returns {Object} - Simulated insights
   */
  generateSimulatedCampaignInsights(campaign) {
    console.log('Generating simulated campaign insights');
    
    // Extract key metrics
    const campaignName = campaign.campaignName || campaign[''] || 'Unknown Campaign';
    const isProfit = (campaign['Total Net Profit'] || 0) > 0;
    const roas = campaign['Total ROAS'] || 0;
    const adSpend = campaign['Ad Spend'] || 0;
    const revenue = campaign['Total Revenue'] || 0;
    const profit = campaign['Total Net Profit'] || 0;
    
    // Generate appropriate insight based on campaign performance
    let insight;
    if (isProfit && roas >= 2.5) {
      insight = `Campaign "${campaignName}" is highly profitable with a net profit of $${profit.toFixed(2)}. The ROAS is ${roas.toFixed(2)}, meaning for every $1 spent, you're earning $${roas.toFixed(2)} in revenue. This campaign is performing exceptionally well and should be scaled by increasing the daily budget by 20-30%. Consider testing similar audiences to expand reach while maintaining the strong performance.`;
    } else if (isProfit && roas >= 1.5) {
      insight = `Campaign "${campaignName}" is moderately profitable with a net profit of $${profit.toFixed(2)}. The ROAS is ${roas.toFixed(2)}, which is good but has room for improvement. Consider optimizing your targeting parameters and ad creative to increase conversion rates. A small budget increase of 10-15% could help gather more data for optimization while maintaining profitability.`;
    } else if (isProfit) {
      insight = `Campaign "${campaignName}" is marginally profitable with a net profit of $${profit.toFixed(2)}. The ROAS is ${roas.toFixed(2)}, which is just above the breakeven point. Focus on improving the campaign efficiency through better targeting, creative testing, and possibly adjusting your bid strategy. Maintain the current budget while optimizing before considering any scaling.`;
    } else {
      insight = `Campaign "${campaignName}" is currently unprofitable with a net loss of $${Math.abs(profit).toFixed(2)}. The ROAS is ${roas.toFixed(2)}, below the breakeven point of 1.0. Consider pausing this campaign if it's been running for more than 7 days without improvement. If you want to continue testing, reduce the budget by 50% and focus on narrowing your audience targeting, improving ad creative, and optimizing landing page conversion rates.`;
    }
    
    return {
      insight,
      model: "Simulated AI Assistant",
      id: "sim-" + Date.now()
    };
  }
  
  /**
   * Generate simulated dashboard insights when API is unavailable
   * 
   * @param {Object[]} allCampaignsData - All campaigns data
   * @returns {Object} - Simulated insights
   */
  generateSimulatedDashboardInsights(allCampaignsData) {
    console.log('Generating simulated dashboard insights');
    
    // If data is available, use it for more accurate simulated insights
    let insight;
    if (Array.isArray(allCampaignsData) && allCampaignsData.length > 0) {
      const totalCampaigns = allCampaignsData.length;
      const profitableCampaigns = allCampaignsData.filter(c => (c['Total Net Profit'] || 0) > 0).length;
      const profitPercentage = (profitableCampaigns / totalCampaigns * 100).toFixed(1);
      const totalSpend = allCampaignsData.reduce((sum, c) => sum + (c['Ad Spend'] || 0), 0);
      const totalRevenue = allCampaignsData.reduce((sum, c) => sum + (c['Total Revenue'] || 0), 0);
      const totalProfit = allCampaignsData.reduce((sum, c) => sum + (c['Total Net Profit'] || 0), 0);
      const overallROAS = totalRevenue / totalSpend;
      
      // Sort campaigns by performance
      const sortedCampaigns = [...allCampaignsData].sort((a, b) => (b['Total Net Profit'] || 0) - (a['Total Net Profit'] || 0));
      const topCampaign = sortedCampaigns[0];
      const worstCampaign = sortedCampaigns[sortedCampaigns.length - 1];
      
      if (totalProfit > 0) {
        insight = `Your e-commerce campaigns are collectively profitable with a total net profit of $${totalProfit.toFixed(2)}. ${profitableCampaigns} out of ${totalCampaigns} campaigns (${profitPercentage}%) are profitable. Your average ROAS across all campaigns is ${overallROAS.toFixed(2)}.

Key recommendations:
1. Scale your top-performing campaign "${topCampaign?.campaignName || topCampaign?.[''] || 'Top Campaign'}" by increasing its budget by 20%.
2. Reallocate budget from "${worstCampaign?.campaignName || worstCampaign?.[''] || 'Worst Campaign'}" to better performing campaigns.
3. Focus on improving your ad creative and targeting on mid-tier campaigns to boost their performance.
4. Consider testing new audiences similar to those in your top-performing campaigns.`;
      } else {
        insight = `Your e-commerce campaigns are collectively showing a net loss of $${Math.abs(totalProfit).toFixed(2)}. Only ${profitableCampaigns} out of ${totalCampaigns} campaigns (${profitPercentage}%) are profitable. Your average ROAS is ${overallROAS.toFixed(2)}, below the breakeven point.

Key recommendations:
1. Pause your worst-performing campaign "${worstCampaign?.campaignName || worstCampaign?.[''] || 'Worst Campaign'}" immediately to stop further losses.
2. Reduce budgets across all underperforming campaigns by 50%.
3. Analyze and replicate the targeting and creative strategies from "${topCampaign?.campaignName || topCampaign?.[''] || 'Top Campaign'}".
4. Review your landing page conversion rate and make improvements to boost overall performance.
5. Consider revising your product pricing strategy if margins are consistently tight.`;
      }
    } else {
      // Generic insight if no data is available
      insight = `Based on the available e-commerce campaign data, approximately 70% of your campaigns are profitable with an average ROAS of 2.1. Your top-performing campaigns show strong customer engagement with conversion rates above 4%, while underperforming campaigns have high CPAs.

Key recommendations:
1. Scale your top 3 campaigns by increasing their budgets by 15-20%.
2. Pause campaigns with ROAS below 0.8 that have been running for more than 7 days.
3. For campaigns with ROAS between 0.8-1.2, optimize targeting and creative elements.
4. Consider implementing more aggressive remarketing strategies to improve overall conversion rates.
5. Test new audience segments similar to those in your profitable campaigns.`;
    }
    
    return {
      insight,
      model: "Simulated AI Assistant",
      id: "sim-" + Date.now()
    };
  }
}

export default ApiIntegrationService;