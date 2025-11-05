import React, { useMemo, useState } from 'react'
import { apiBase as cfgApiBase } from '../config'
import { Box, Paper, IconButton, Typography, Divider, Tooltip } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import Chatbot from './Chatbot'
import CloseIcon from '@material-ui/icons/Close'
import ZoomOutMapIcon from '@material-ui/icons/ZoomOutMap'
import CropSquareIcon from '@material-ui/icons/CropSquare'
import FullscreenExitIcon from '@material-ui/icons/FullscreenExit'
import ChatIcon from '@material-ui/icons/Chat'

const useStyles = makeStyles(theme => ({
  launcher: {
    position: 'fixed',
    right: theme.spacing(3),
    bottom: theme.spacing(3),
    zIndex: 1500,
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    background: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
    borderRadius: 24,
    padding: theme.spacing(1.2, 1.6),
    boxShadow: theme.shadows[6],
    cursor: 'pointer',
    userSelect: 'none'
  },
  panel: {
    position: 'fixed',
    right: theme.spacing(3),
    bottom: theme.spacing(3),
    zIndex: 1500,
    display: 'flex',
    flexDirection: 'column',
    boxShadow: theme.shadows[8],
    borderRadius: 12,
    overflow: 'hidden',
    resize: 'both',
    background: theme.palette.background.paper
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    padding: theme.spacing(1.25),
    gap: theme.spacing(1)
  },
  headerTitle: { fontWeight: 600 },
  grow: { marginLeft: 'auto' },
  body: { height: '100%', minHeight: 0, display: 'flex' }
}))

export default function ChatbotWidget() {
  const classes = useStyles()
  const [open, setOpen] = useState(false)
  const [size, setSize] = useState('md')

  const basePrefix = useMemo(() => {
    const base = String(cfgApiBase || '')
      .replace(/\/$/, '')
      .replace(/\/api$/, '')
    return `${base}`
  }, [])

  const panelDims = useMemo(() => {
    if (size === 'sm') return { width: '22vw', height: '38vh', minWidth: 320, minHeight: 360 }
    if (size === 'lg') return { width: '45vw', height: '75vh', minWidth: 420, minHeight: 420 }
    return { width: '30vw', height: '50vh', minWidth: 360, minHeight: 400 }
  }, [size])

  const SizeIcon = useMemo(() => {
    if (size === 'sm') return ZoomOutMapIcon
    if (size === 'md') return CropSquareIcon
    return FullscreenExitIcon
  }, [size])

  const cycleSize = () => setSize(prev => (prev === 'sm' ? 'md' : prev === 'md' ? 'lg' : 'sm'))

  return (
    <>
      {!open && (
        <div className={classes.launcher} onClick={() => setOpen(true)}>
          <ChatIcon fontSize='small' />
          <Typography variant='body2'>Chat</Typography>
        </div>
      )}

      {open && (
        <Paper className={classes.panel} style={panelDims} elevation={8}>
          <Box className={classes.header}>
            <Typography variant='subtitle1' className={classes.headerTitle}>
              NOMAD Compass
            </Typography>
            <Box className={classes.grow} />
            <Tooltip title='Resize'>
              <IconButton size='small' onClick={cycleSize}>
                <SizeIcon fontSize='small' />
              </IconButton>
            </Tooltip>
            <Tooltip title='Close'>
              <IconButton size='small' onClick={() => setOpen(false)}>
                <CloseIcon fontSize='small' />
              </IconButton>
            </Tooltip>
          </Box>
          <Divider />
          <Box className={classes.body}>
            <Chatbot apiBase={basePrefix} />
          </Box>
        </Paper>
      )}
    </>
  )
}
