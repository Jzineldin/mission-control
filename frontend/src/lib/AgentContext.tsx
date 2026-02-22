import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

const AgentContext = createContext<{ agentName: string }>({ agentName: 'Agent' })

export function AgentProvider({ children }: { children: ReactNode }) {
  const [agentName, setAgentName] = useState('Agent')

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(cfg => { if (cfg.name) setAgentName(cfg.name) })
      .catch(() => {})
  }, [])

  return <AgentContext.Provider value={{ agentName }}>{children}</AgentContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAgentName = () => useContext(AgentContext).agentName
