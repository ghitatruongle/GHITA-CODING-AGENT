// ==============================================================================
// GHITA CODING AGENT — usePairingSocket Hook
// Socket connection and pairing logic extracted from PairingScreen
// ==============================================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { socketService } from '../../services/socketService';
import {
  CLOUD_DISCOVERY_API_KEY,
  CLOUD_DISCOVERY_API_URL,
  ENABLE_CLOUD_DISCOVERY,
} from '../../config';
import { getLastServer, saveLastServer, getDeviceId } from '../../services/storageService';
import type { ConnectionState } from '../../types';
import type { PairingScreenProps } from '../../navigation/types';
import { useTranslation } from '../../i18n/context';
import { assertSafeServerAddress } from '../../services/serverAddress';

const PAIRING_CODE_LENGTH = 6;

export interface UsePairingSocketReturn {
  connectionState: ConnectionState;
  serverAddress: string;
  setServerAddress: (addr: string) => void;
  errorMessage: string | null;
  isConnecting: boolean;
  handleWifiConnect: (pairingCode: string) => void;
  clearError: () => void;
  setConnectionError: (msg: string) => void;
}

export function usePairingSocket(
  navigation: PairingScreenProps['navigation'],
): UsePairingSocketReturn {
  const { t } = useTranslation();
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const connectionStateRef = useRef<ConnectionState>('disconnected');
  const [serverAddress, setServerAddress] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const activeAddressRef = useRef('');

  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearTimers = useCallback(() => {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Load last server address on mount
  useEffect(() => {
    void getLastServer().then((addr) => {
      if (addr) setServerAddress(addr);
    });
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  // Register socket callbacks
  useEffect(() => {
    socketService.setCallbacks({
      onConnectionChange: (state) => {
        setConnectionState(state);
        connectionStateRef.current = state;
        if (state === 'error') {
          setErrorMessage(t('pairing.pairErrConnection'));
          clearTimers();
        }
      },
      onPairConfirm: (deviceName) => {
        clearTimers();
        setConnectionState('connected');
        connectionStateRef.current = 'connected';
        const addrToSave = activeAddressRef.current || serverAddress;
        void saveLastServer(addrToSave);
        Alert.alert(t('common.success'), t('pairing.connectSuccess', { deviceName }));
        navigation.replace('RemoteControl', { serverAddress: addrToSave, deviceName });
      },
      onError: (error) => {
        clearTimers();
        setErrorMessage(error);
      },
    });
  }, [navigation, clearTimers, serverAddress, t]);

  const handleWifiConnect = useCallback(
    (pairingCode: string) => {
      setErrorMessage(null);
      clearTimers();

      if (
        connectionStateRef.current === 'connecting' ||
        connectionStateRef.current === 'pairing' ||
        connectionStateRef.current === 'connected'
      ) {
        return;
      }

      if (!pairingCode.trim() || pairingCode.length < PAIRING_CODE_LENGTH) {
        setErrorMessage(t('pairing.pairingCodeLengthErr', { length: PAIRING_CODE_LENGTH }));
        return;
      }

      const code = pairingCode.toUpperCase().trim();
      setConnectionState('connecting');
      connectionStateRef.current = 'connecting';

      const discoverAndConnect = async () => {
        let addressesToTry: string[] = [];
        let isManualAddress = false;

        if (!serverAddress.trim()) {
          if (!ENABLE_CLOUD_DISCOVERY) throw new Error(t('pairing.pairErrCloudDisabled'));
          if (!CLOUD_DISCOVERY_API_KEY) throw new Error(t('pairing.pairErrApiKeyMissing'));
          try {
            const res = await fetch(
              `${CLOUD_DISCOVERY_API_URL}/${CLOUD_DISCOVERY_API_KEY}/${code}`,
            );
            const dataText = await res.text();
            const cleanedData = dataText.replace(/^"|"$/g, '').trim();
            if (!cleanedData) throw new Error(t('pairing.pairErrNoComputer'));
            const parts = cleanedData.split('_');
            if (parts.length < 2) throw new Error(t('pairing.pairErrCloudFail'));
            const port = parts[parts.length - 1] ?? '';
            const rawIps = parts.slice(0, parts.length - 1);
            addressesToTry = rawIps
              .map((ip) => ip.replace(/-/g, '.'))
              .filter((ip) => ip !== '127.0.0.1' && ip !== 'localhost' && ip !== '::1')
              .map((ip) => `http://${ip}:${port}`);
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            if (
              message === t('pairing.pairErrNoComputer') ||
              message === t('pairing.pairErrCloudFail')
            ) {
              throw e;
            }
            addressesToTry = [];
          }
        } else {
          const address = serverAddress.includes('://') ? serverAddress : `http://${serverAddress}`;
          const fullAddress = address.includes(':') ? address : `${address}:8080`;
          addressesToTry = [fullAddress];
          isManualAddress = true;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const pingPromises = addressesToTry.map(async (url) => {
          try {
            assertSafeServerAddress(url);
            const res = await fetch(`${url}/health`, { signal: controller.signal });
            if (res.status === 200) {
              const data = await res.json();
              if (data.status === 'ok') {
                return { url, pairingCode: data.pairingCode || code };
              }
            }
          } catch {
            // ignore
          }
          throw new Error('Failed');
        });

        let firstSuccess;
        try {
          if (pingPromises.length === 0) throw new Error('No local IP addresses to try');
          firstSuccess = await new Promise<{ url: string; pairingCode: string }>(
            (resolve, reject) => {
              let rejectedCount = 0;
              pingPromises.forEach((p) => {
                p.then(resolve).catch(() => {
                  rejectedCount++;
                  if (rejectedCount === pingPromises.length) {
                    reject(new Error('All local pings failed'));
                  }
                });
              });
            },
          );
        } catch {
          if (isManualAddress) throw new Error(t('pairing.pairErrConnection'));
          throw new Error(t('pairing.pairErrLanPingFail'));
        }

        clearTimeout(timeoutId);
        const savedAddr = firstSuccess.url.replace('http://', '').replace('https://', '');
        setServerAddress(savedAddr);
        activeAddressRef.current = savedAddr;
        socketService.connect(firstSuccess.url);

        checkIntervalRef.current = setInterval(() => {
          if (socketService.isSocketConnected) {
            if (checkIntervalRef.current) {
              clearInterval(checkIntervalRef.current);
              checkIntervalRef.current = null;
            }
            void getDeviceId().then((dId) => {
              socketService.sendPairingCode(firstSuccess.pairingCode, dId || undefined);
            });
          }
        }, 200);

        timeoutRef.current = setTimeout(() => {
          clearTimers();
          if (
            connectionStateRef.current === 'connecting' ||
            connectionStateRef.current === 'pairing'
          ) {
            const wasSocketConnected = socketService.isSocketConnected;
            socketService.disconnect();
            setConnectionState('error');
            setErrorMessage(
              wasSocketConnected ? t('pairing.pairErrBtFail') : t('pairing.pairErrSocket'),
            );
          }
        }, 10000);
      };

      void discoverAndConnect().catch((err: unknown) => {
        clearTimers();
        setConnectionState('error');
        setErrorMessage(err instanceof Error ? err.message : t('pairing.pairErrBtFindFail'));
      });
    },
    [serverAddress, t, clearTimers],
  );

  const clearError = useCallback(() => setErrorMessage(null), []);
  const setConnectionError = useCallback((msg: string) => {
    setConnectionState('error');
    connectionStateRef.current = 'error';
    setErrorMessage(msg);
  }, []);
  const isConnecting = connectionState === 'connecting' || connectionState === 'pairing';

  return {
    connectionState,
    serverAddress,
    setServerAddress,
    errorMessage,
    isConnecting,
    handleWifiConnect,
    clearError,
    setConnectionError,
  };
}
