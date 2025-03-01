// frontend/src/services/AnthropicService.js

/**
 * Service for interacting with the Anthropic API
 */
class AnthropicService {
  constructor(apiKey = null) {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.anthropic.com/v1';
    this.model = 'claude-3-7-sonnet-20250219'; // Using the latest model
  }

  /**
   * Set the API key
   * @param {string} apiKey - Anthropic API key
   */
  setApiKey(apiKey) {
    this.apiKey = apiKey;
    console.log('Anthropic API key set successfully');
  }

  /**
   * Generate campaign insights using Anthropic's Claude API
   * 
   * @param {Object} campaignData - The campaign data to analyze
   * @param {string} question - The specific question to ask about the data
   * @returns {Promise<Object>} - The response from the API
   */
  async generateCampaignInsights(campaignData, question = "Is this campaign profitable?") {
    if (!this.apiKey) {
      console.warn("Anthropic API key not set, falling back to simulated insights");
      return this.generateSimulatedCampaignInsights(campaignData);
    }

    try {
      // Prepare data summary to keep context size reasonable
      const dataSummary = this.prepareCampaignSummary(campaignData);
      
      console.log('Generating campaign insights using Anthropic API');
      
      // Craft the prompt for Claude
      const systemPrompt = `You are an e-commerce marketing analytics expert. Analyze the provided campaign data and answer the question: "${question}". 
      Provide actionable insights and clear recommendations. Focus on profitability, ROAS, and optimization opportunities.`;
      
      // Format the message for the API
      const response = await fetch(`${this.baseURL}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1000,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: `Here is the campaign data:\n\n${JSON.stringify(dataSummary, null, 2)}\n\n${question}`
            }
          ]
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API error: ${errorData.error?.message || response.statusText}`);
      }
      
      const result = await response.json();
      
      return {
        insight: result.content[0].text,
        model: result.model,
        id: result.id
      };
    } catch (error) {
      console.error('Error calling Anthropic API:', error);
      return this.generateSimulatedCampaignInsights(campaignData);
    }
  }
  
  /**
   * Generate overall dashboard insights using Anthropic's Claude API
   * 
   * @param {Object[]} allCampaignsData - Array of all campaign data
   * @returns {Promise<Object>} - The response from the API
   */
  async generateDashboardInsights(allCampaignsData) {
    if (!this.apiKey) {
      console.warn("Anthropic API key not set, falling back to simulated insights");
      return this.generateSimulatedDashboardInsights(allCampaignsData);
    }

    try {
      console.log('Generating dashboard insights using Anthropic API');
      
      // Create dashboard summary (simplified for API context limits)
      const dashboardSummary = this.prepareDashboardSummary(allCampaignsData);
      
      // Craft the prompt for Claude
      const systemPrompt = `You are an e-commerce marketing analytics expert. Analyze the provided dashboard data and provide comprehensive insights about the overall campaign performance. 
      Answer the question: "Are these e-commerce campaigns collectively profitable?"
      Include specific actionable recommendations for optimization, scaling successful campaigns, and addressing underperforming ones.
      Your analysis should be data-driven, highlighting key metrics like ROAS, profit margins, and overall ROI.`;
      
      // Format the message for the API
      const response = await fetch(`${this.baseURL}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1000,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: `Here is the e-commerce dashboard data:\n\n${JSON.stringify(dashboardSummary, null, 2)}\n\nProvide a comprehensive analysis of the overall campaign performance, profitability, and specific recommendations for optimization.`
            }
          ]
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API error: ${errorData.error?.message || response.statusText}`);
      }
      
      const result = await response.json();
      
      return {
        insight: result.content[0].text,
        model: result.model,
        id: result.id
      };
    } catch (error) {
      console.error('Error calling Anthropic API:', error);
      return this.generateSimulatedDashboardInsights(allCampaignsData);
    }
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
  /**
   * Generate a response to a user's chat question about campaign data
   * 
   * @param {Object} context - The chat context including question and data
   * @param {string} context.question - The user's question
   * @param {Object} context.dashboardData - Summary of dashboard data
   * @returns {Promise<Object>} - The response from the API
   */
  async generateChatResponse(context) {
    if (!this.apiKey) {
      console.warn("Anthropic API key not set, falling back to simulated chat response");
      return this.generateSimulatedChatResponse(context);
    }

    try {
      console.log('Generating chat response using Anthropic API');
      
      // Prepare data summary
      const dataSummary = JSON.stringify(context.dashboardData, null, 2);
      
      // Craft the system prompt for Claude
      const systemPrompt = `You are an e-commerce marketing analytics assistant specializing in campaign data analysis. 
      Analyze the provided e-commerce dashboard data and answer the user's question.
      
      Provide concise, data-driven insights and clear recommendations. Be specific and reference metrics from the provided data.
      Focus on actionable advice when appropriate. Be conversational but professional.
      
      If you don't have enough information to answer a specific question, acknowledge this and suggest what data might be helpful.`;
      
      // Format the message for the API
      const response = await fetch(`${this.baseURL}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1000,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: `Here is the e-commerce dashboard data:\n\n${dataSummary}\n\nMy question is: ${context.question}`
            }
          ]
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API error: ${errorData.error?.message || response.statusText}`);
      }
      
      const result = await response.json();
      
      return {
        insight: result.content[0].text,
        model: result.model,
        id: result.id
      };
    } catch (error) {
      console.error('Error calling Anthropic API for chat:', error);
      return this.generateSimulatedChatResponse(context);
    }
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
    // Fix in generateSimulatedChatResponse - profit section
    else if (lowerQuestion.includes('profit') || lowerQuestion.includes('profitable')) {
      response = `Your campaigns have generated $${totalProfit.toFixed(2)} in total net profit. `;
      response += `${profitableCampaignsCount} out of ${totalCampaignsCount} campaigns (${profitablePercentage}%) are profitable. `;
      response += totalProfit > 0 
        ? 'Overall, your campaign strategy is working well.'
        : 'You may want to reconsider your campaign strategy to improve profitability.';
    }

    // Fix in top campaigns section
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

    // Fix in worst campaigns section
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
    // Fix in products section
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
}




export default AnthropicService;