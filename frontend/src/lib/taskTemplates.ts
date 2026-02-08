const TASK_TEMPLATES = [
  {
    id: 'research-competitors',
    name: '🔍 Research Competitors',
    category: 'research',
    description: 'Analyze competitors, their features, pricing, and positioning',
    template: {
      title: 'Research competitors for {product/service}',
      description: 'Research and analyze competitors in the {product/service} space. Include:\n\n1. Top 5-10 competitors with brief overview\n2. Feature comparison (what they offer vs what we offer)\n3. Pricing analysis\n4. Positioning & messaging patterns\n5. Key differentiators and gaps we could exploit\n\nProvide actionable insights and recommendations.',
      tags: ['research', 'competitive'],
      priority: 'medium'
    }
  },
  {
    id: 'blog-post',
    name: '✍️ Write Blog Post',
    category: 'content',
    description: 'Create a comprehensive blog post on any topic',
    template: {
      title: 'Write blog post: {title/topic}',
      description: 'Write a comprehensive blog post about {topic}. Requirements:\n\n1. SEO-optimized title and structure\n2. 1500-2500 words\n3. Include relevant examples and data\n4. Actionable takeaways for readers\n5. Engaging introduction and conclusion\n6. Suggested meta description\n\nTarget audience: {describe your audience}\nTone: {professional/casual/technical}',
      tags: ['content', 'writing'],
      priority: 'medium'
    }
  },
  {
    id: 'email-analysis',
    name: '📧 Analyze Important Email',
    category: 'analysis',
    description: 'Summarize and analyze an important email or message',
    template: {
      title: 'Analyze email from {person/organization}',
      description: 'Analyze this email and provide:\n\n1. Key points and main message\n2. Required actions or responses\n3. Deadlines or time-sensitive items\n4. Recommended next steps\n5. Draft reply if response needed\n\nEmail content:\n{paste email here}',
      tags: ['email', 'analysis'],
      priority: 'high'
    }
  },
  {
    id: 'outreach-strategy',
    name: '🎯 Outreach Strategy',
    category: 'strategy',
    description: 'Create a targeted outreach and engagement plan',
    template: {
      title: 'Outreach strategy for {target audience}',
      description: 'Develop an outreach strategy for {target audience/market}:\n\n1. Target persona definition\n2. Best channels and platforms to reach them\n3. Key messages and value propositions\n4. Outreach sequence (emails, social, calls)\n5. Success metrics and tracking\n6. Template messages and scripts\n\nGoal: {what you want to achieve}\nTimeline: {when you need results}',
      tags: ['outreach', 'strategy'],
      priority: 'medium'
    }
  },
  {
    id: 'document-summary',
    name: '📄 Document Review',
    category: 'analysis', 
    description: 'Summarize and extract key insights from documents',
    template: {
      title: 'Review and summarize: {document name}',
      description: 'Review this document/article and provide:\n\n1. Executive summary (2-3 paragraphs)\n2. Key findings and insights\n3. Important data points or statistics\n4. Action items or recommendations\n5. Questions or areas needing clarification\n\nDocument: {paste content or URL here}\nFocus areas: {what specific aspects to emphasize}',
      tags: ['analysis', 'summary'],
      priority: 'medium'
    }
  },
  {
    id: 'market-research',
    name: '📊 Market Research',
    category: 'research',
    description: 'Deep dive market analysis for products or services',
    template: {
      title: 'Market research: {market/industry}',
      description: 'Conduct comprehensive market research for {market/industry}:\n\n1. Market size and growth trends\n2. Key players and market share\n3. Customer segments and personas\n4. Pain points and unmet needs\n5. Pricing models and structures\n6. Regulatory or industry constraints\n7. Opportunities and threats\n\nGeography: {target region}\nTimeframe: {specific period to analyze}',
      tags: ['research', 'market'],
      priority: 'medium'
    }
  },
  {
    id: 'bug-reproduction',
    name: '🐛 Bug Investigation',
    category: 'technical',
    description: 'Investigate and document a technical bug or issue',
    template: {
      title: 'Investigate bug: {brief description}',
      description: 'Investigate this technical issue:\n\n**Bug Description:**\n{describe the problem}\n\n**Steps to Reproduce:**\n1. {step 1}\n2. {step 2}\n3. {step 3}\n\n**Expected vs Actual Behavior:**\n{what should happen vs what actually happens}\n\nPlease provide:\n1. Root cause analysis\n2. Potential solutions\n3. Workarounds if available\n4. Impact assessment\n5. Recommended priority level',
      tags: ['bug', 'technical'],
      priority: 'high'
    }
  },
  {
    id: 'lead-qualification',
    name: '🎯 Lead Research',
    category: 'sales',
    description: 'Research and qualify a potential lead or prospect',
    template: {
      title: 'Research prospect: {company/person name}',
      description: 'Research this potential lead and provide:\n\n**Company/Person:** {name}\n**Website:** {URL if available}\n**Industry:** {sector}\n\n**Research Report:**\n1. Company overview and key facts\n2. Recent news, funding, or developments\n3. Key decision makers and contacts\n4. Pain points our solution could address\n5. Ideal outreach approach and timing\n6. Qualification score (1-10) with reasoning\n\n**Recommended Next Steps:**\n{specific actions to take}',
      tags: ['sales', 'research'],
      priority: 'medium'
    }
  }
]

export default TASK_TEMPLATES