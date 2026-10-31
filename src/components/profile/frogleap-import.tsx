import { Button, Stack, Tab, Tabs, TextField, Typography } from '@mui/material'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseDialog } from '@/components/base'
import {
  frogleapConsumeTicket,
  frogleapSendLoginLink,
  frogleapSiteConfig,
} from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import { isValidUrl } from '@/utils/network'

const TICKET_PATTERN = /[?&]ticket=([^\s&]+)/

interface TurnstileWidget {
  render: (el: HTMLElement, options: Record<string, unknown>) => string
  getResponse: (id: string) => string | undefined
}

declare global {
  interface Window {
    turnstile?: TurnstileWidget
  }
}

const extractTicket = (text: string) => TICKET_PATTERN.exec(text)?.[1] ?? ''

type ImportMode = 'frogleap' | 'url'

export const FrogLeapImport = (props: {
  onUrlImport: (url: string) => Promise<void>
}) => {
  const { onUrlImport } = props
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<ImportMode>('frogleap')
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [link, setLink] = useState('')
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [sitekey, setSitekey] = useState('')
  const turnstileRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const importingRef = useRef(false)

  const ticket = useMemo(() => extractTicket(link), [link])
  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim())

  const reset = useCallback(() => {
    setEmail('')
    setSent(false)
    setLink('')
    setUrl('')
    widgetIdRef.current = null
    importingRef.current = false
    if (turnstileRef.current) turnstileRef.current.innerHTML = ''
  }, [])

  useEffect(() => {
    if (!open) return
    frogleapSiteConfig()
      .then((config) => setSitekey(config.turnstile_site_key ?? ''))
      .catch(() => setSitekey(''))
  }, [open])

  useEffect(() => {
    if (!open || mode !== 'frogleap' || !sitekey || widgetIdRef.current) return
    const render = () => {
      if (window.turnstile && turnstileRef.current && !widgetIdRef.current) {
        widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
          sitekey,
        })
      }
    }
    if (window.turnstile) {
      render()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.onload = render
    document.head.appendChild(script)
  }, [open, mode, sitekey])

  useEffect(() => {
    if (!open || !sent || ticket) return
    const timer = setInterval(() => {
      navigator.clipboard
        .readText()
        .then((text) => {
          const found = extractTicket(text)
          if (found) setLink(text.trim())
        })
        .catch(() => undefined)
    }, 1500)
    return () => clearInterval(timer)
  }, [open, sent, ticket])

  const handleSend = async () => {
    if (!emailValid) {
      showNotice.error('profiles.page.feedback.errors.invalidEmail')
      return
    }
    const token =
      widgetIdRef.current && window.turnstile
        ? window.turnstile.getResponse(widgetIdRef.current)
        : undefined
    if (sitekey && !token) {
      showNotice.error('profiles.page.feedback.errors.turnstileMissing')
      return
    }
    setLoading(true)
    try {
      const result = await frogleapSendLoginLink(email.trim(), token)
      if (result.throttled) {
        showNotice.info('profiles.page.feedback.notifications.linkThrottled')
      }
      setSent(true)
    } catch (err) {
      showNotice.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleTicketImport = useCallback(
    async (target: string) => {
      const found = extractTicket(target)
      if (!found) {
        showNotice.error('profiles.page.feedback.errors.invalidMagicLink')
        return
      }
      if (importingRef.current) return
      importingRef.current = true
      setLoading(true)
      try {
        const result = await frogleapConsumeTicket(found)
        setOpen(false)
        reset()
        await onUrlImport(result.sub_url)
      } catch (err) {
        showNotice.error(err)
      } finally {
        setLoading(false)
        importingRef.current = false
      }
    },
    [onUrlImport, reset],
  )

  useEffect(() => {
    if (ticket && sent && mode === 'frogleap') void handleTicketImport(link)
  }, [ticket, sent, mode, link, handleTicketImport])

  const handleUrlImport = async () => {
    const finalUrl = url.trim()
    if (!isValidUrl(finalUrl)) {
      showNotice.error('profiles.page.feedback.errors.invalidUrl')
      return
    }
    setLoading(true)
    try {
      setOpen(false)
      reset()
      await onUrlImport(finalUrl)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setOpen(false)
    reset()
  }

  const urlMode = mode === 'url'

  return (
    <>
      <Button
        variant="contained"
        size="small"
        sx={{ borderRadius: '6px' }}
        onClick={() => setOpen(true)}
      >
        {t('profiles.page.actions.import')}
      </Button>
      <BaseDialog
        open={open}
        title={t('profiles.modals.import.title')}
        contentSx={{ width: 380, pb: 1 }}
        cancelBtn={t('shared.actions.cancel')}
        onClose={handleClose}
        onCancel={handleClose}
        onOk={urlMode ? handleUrlImport : sent ? () => handleTicketImport(link) : handleSend}
        okBtn={
          urlMode
            ? t('profiles.page.actions.import')
            : sent
              ? ticket
                ? t('profiles.modals.frogleap.confirm')
                : null
              : t('profiles.modals.frogleap.send')
        }
        loading={loading}
      >
        <Tabs
          value={mode}
          onChange={(_, value: ImportMode) => setMode(value)}
          sx={{ mb: 1 }}
        >
          <Tab value="frogleap" label={t('profiles.modals.import.tabAccount')} />
          <Tab value="url" label={t('profiles.modals.import.tabUrl')} />
        </Tabs>
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          {mode === 'frogleap' && !sent && (
            <>
              <TextField
                autoFocus
                size="small"
                fullWidth
                label={t('profiles.modals.frogleap.emailLabel')}
                placeholder={t('profiles.modals.frogleap.emailPlaceholder')}
                value={email}
                disabled={loading}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && emailValid && !loading) {
                    e.preventDefault()
                    void handleSend()
                  }
                }}
              />
              {sitekey && <div ref={turnstileRef} />}
            </>
          )}
          {mode === 'frogleap' && sent && (
            <>
              <Typography variant="body2" color="text.secondary">
                {t('profiles.modals.frogleap.sentHint', { email: email.trim() })}
              </Typography>
              <TextField
                size="small"
                fullWidth
                label={t('profiles.modals.frogleap.linkLabel')}
                placeholder={t('profiles.modals.frogleap.linkPlaceholder')}
                value={link}
                disabled={loading}
                onChange={(e) => setLink(e.target.value)}
              />
            </>
          )}
          {urlMode && (
            <TextField
              autoFocus
              size="small"
              fullWidth
              label={t('profiles.modals.import.urlLabel')}
              placeholder={t('profiles.page.importForm.placeholder')}
              value={url}
              disabled={loading}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && url.trim() && !loading) {
                  e.preventDefault()
                  void handleUrlImport()
                }
              }}
            />
          )}
        </Stack>
      </BaseDialog>
    </>
  )
}
