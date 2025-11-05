import React, { useEffect, useMemo, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import {
  AppBar,
  Toolbar,
  Box,
  Paper,
  Typography,
  TextField,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Chip,
  CircularProgress,
  Button,
  Divider
} from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import SendIcon from '@material-ui/icons/Send'
import PlayArrowIcon from '@material-ui/icons/PlayArrow'
import RefreshIcon from '@material-ui/icons/Refresh'

const useStyles = makeStyles(theme => ({
  root: { display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: theme.palette.background.default },
  appbar: { boxShadow: 'none', borderBottom: `1px solid ${theme.palette.divider}` },
  container: { margin: 'auto', width: 'min(900px, 100%)', display: 'flex', flexDirection: 'column', height: '100%' },
  chatBox: { flex: 1, overflowY: 'auto', padding: theme.spacing(2), background: theme.palette.type === 'dark' ? '#0d1117' : '#fafafa' },
  messageUser: { alignSelf: 'flex-end', background: theme.palette.primary.main, color: theme.palette.primary.contrastText, padding: theme.spacing(1.5), borderRadius: 16, maxWidth: '80%', marginBottom: theme.spacing(1) },
  messageBot: { alignSelf: 'flex-start', background: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, padding: theme.spacing(1.5), borderRadius: 16, maxWidth: '80%', marginBottom: theme.spacing(1) },
  inputRow: { display: 'flex', alignItems: 'center', padding: theme.spacing(1), gap: theme.spacing(1), borderTop: `1px solid ${theme.palette.divider}` },
  starters: { display: 'flex', flexWrap: 'wrap', gap: theme.spacing(1), marginTop: theme.spacing(1), marginBottom: theme.spacing(1) },
  sourcesBox: { marginTop: theme.spacing(1), display: 'flex', flexWrap: 'wrap', gap: theme.spacing(1) },
  headerActions: { display: 'flex', gap: theme.spacing(1), marginLeft: 'auto' }
}))

export default function Chatbot({
  apiBase,
  defaultK,
  embedModel,
  chatModel,
  temperature
}) {
  const classes = useStyles()
  const base = useMemo(() => {
    const trimmed = (apiBase || '').replace(/\/$/, '')
    return trimmed.endsWith('/chatbot-api') ? trimmed : `${trimmed}/chatbot-api`
  }, [apiBase])

  const [health, setHealth] = useState(null)
  const [building, setBuilding] = useState(false)
  const [ready, setReady] = useState(false)
  const [starters, setStarters] = useState([])
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const [streaming, setStreaming] = useState(false)
  const chatRef = useRef(null)
  const controllerRef = useRef(null)

  const scrollToBottom = () => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }

  useEffect(() => {
    fetch(`${base}/health`).then(r => r.json()).then(setHealth).catch(() => setHealth({ status: 'error' }))
    fetch(`${base}/starters`).then(r => r.json()).then(d => setStarters(d.starters || [])).catch(() => setStarters([]))
  }, [base])

  useEffect(() => {
    scrollToBottom()
  }, [messages, streaming])

  const handleBuild = async () => {
    setBuilding(true)
    try {
      const r = await fetch(`${base}/build`, { method: 'POST' })
      if (!r.ok) throw new Error('build failed')
      setReady(true)
    } catch {
      setReady(false)
    } finally {
      setBuilding(false)
    }
  }

  const abortStream = () => {
    if (controllerRef.current) controllerRef.current.abort()
    setStreaming(false)
  }

  const streamResponse = async res => {
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const commitDelta = delta => {
    setMessages(prev => {
      const copy = [...prev]
      const lastIdx = copy.length - 1
      copy[lastIdx] = {
        ...copy[lastIdx],
        content: (copy[lastIdx].content || '') + delta
      }
      return copy
    })
  }

  const applyMeta = meta => {
    if (!meta) return
    setMessages(prev => {
      const copy = [...prev]
      const lastIdx = copy.length - 1
      copy[lastIdx] = { ...copy[lastIdx], sources: meta.sources || [] }
      return copy
    })
  }

  const parseFrames = chunk => {
    buffer += chunk
    const frames = buffer.split('\n\n')
    buffer = frames.pop() || ''
    for (const f of frames) {
      const lines = f.split('\n').filter(Boolean)
      let event = 'message'
      let data = ''
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      if (event === 'meta') {
        try { applyMeta(JSON.parse(data)) } catch {}
      } else if (event === 'chunk') {
        try {
          const obj = JSON.parse(data)
          if (obj.delta) commitDelta(obj.delta)
        } catch {}
      } else if (event === 'done') {
        abortStream()
      }
    }
  }

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    parseFrames(chunk)
  }
}

  const sendMessage = async q => {
  if (!q || streaming) return

  // build once if not ready
  if (!ready && !building) {
    await handleBuild()
    if (!ready) return
  }

  const userMsg = { role: 'user', content: q }
  const botMsg = { role: 'assistant', content: '', sources: [] }
  setMessages(prev => [...prev, userMsg, botMsg])
  setInput('')
  setStreaming(true)

  // minimal payload
  const payload = { question: q }

  controllerRef.current = new AbortController()

  try {
    const res = await fetch(`${base}/ask-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controllerRef.current.signal
    })

    // if the backend still says index missing, try to build once and retry
    if (res.status === 400) {
      try {
        const body = await res.json()
        if (String(body?.detail || '').includes('Index not found')) {
          await handleBuild()
          // retry once
          const res2 = await fetch(`${base}/ask-stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controllerRef.current.signal
          })
          if (!res2.ok || !res2.body) throw new Error('stream failed after rebuild')
          await streamResponse(res2)
          return
        }
      } catch { /* noop */ }
    }

    if (!res.ok || !res.body) throw new Error('stream failed')
    await streamResponse(res)
  } catch {
    abortStream()
  } finally {
    setStreaming(false)
  }
}

  const onSend = () => sendMessage(input.trim())
  const onStarterClick = s => sendMessage(s)

  const onKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  return (
    <Box className={classes.root}>
      <AppBar position='static' color='default' className={classes.appbar}>
        <Toolbar className={classes.container}>
          <Typography variant='h6'>NOMAD Compass</Typography>
          <Box className={classes.headerActions}>
            <Button
              variant='outlined'
              size='small'
              startIcon={<PlayArrowIcon />}
              onClick={handleBuild}
              disabled={building || streaming}
            >
              {building ? 'Building…' : ready ? 'Rebuild' : 'Build'}
            </Button>
            <Button
              variant='outlined'
              size='small'
              startIcon={<RefreshIcon />}
              onClick={() => setMessages([])}
              disabled={streaming}
            >
              Clear
            </Button>
          </Box>
        </Toolbar>
      </AppBar>

      <Box className={classes.container} style={{ flex: 1 }}>
        <Box p={2}>
          {health && (
            <Typography variant='caption' color='textSecondary'>
              Health: {health.status} • Ollama: {health.ollama}
            </Typography>
          )}
          {!ready && (
            <Typography variant='body2' color='textSecondary'>
              Click Build to prepare the in-memory RAG index
            </Typography>
          )}
          {starters?.length > 0 && messages.length === 0 && (
            <Box className={classes.starters}>
              {starters.map((s, i) => (
                <Chip key={i} label={s} onClick={() => onStarterClick(s)} />
              ))}
            </Box>
          )}
        </Box>

        <Paper ref={chatRef} className={classes.chatBox} elevation={0}>
          <List disablePadding>
            {messages.map((m, i) => (
              <ListItem key={i} disableGutters>
                <Box className={m.role === 'user' ? classes.messageUser : classes.messageBot}>
                  <ListItemText
                    primary={
                      <Typography variant='body1' style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {m.content}
                      </Typography>
                    }
                    secondary={
                      m.role === 'assistant' && m.sources?.length > 0 ? (
                        <Box className={classes.sourcesBox}>
                          {m.sources.map((s, idx) => (
                            <Chip
                              key={idx}
                              label={s}
                              variant='outlined'
                              size='small'
                              onClick={() => navigator.clipboard.writeText(s)}
                            />
                          ))}
                        </Box>
                      ) : null
                    }
                  />
                </Box>
              </ListItem>
            ))}
            {streaming && (
              <ListItem>
                <CircularProgress size={18} />
                <Typography variant='caption' style={{ marginLeft: 8 }}>
                  generating…
                </Typography>
              </ListItem>
            )}
          </List>
        </Paper>

        <Divider />

        <Box className={classes.inputRow}>
          <TextField
            fullWidth
            multiline
            minRows={1}
            maxRows={6}
            variant='outlined'
            placeholder={ready ? 'Ask about NOMAD…' : 'Build the index to start'}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={!ready || streaming}
          />
          <IconButton color='primary' onClick={onSend} disabled={!ready || streaming || !input.trim()}>
            <SendIcon />
          </IconButton>
        </Box>
      </Box>
    </Box>
  )
}

Chatbot.propTypes = {
  apiBase: PropTypes.string,
  defaultK: PropTypes.number,
  embedModel: PropTypes.string,
  chatModel: PropTypes.string,
  temperature: PropTypes.number
}

Chatbot.defaultProps = {
  apiBase: '/nomad-oasis',
  defaultK: 8,
  embedModel: 'nomic-embed-text',
  chatModel: 'gpt-oss:20b',
  temperature: 0.2
}
