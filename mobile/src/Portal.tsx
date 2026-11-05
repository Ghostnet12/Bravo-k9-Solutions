import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Linking, Modal, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';
import { navigationPolicy, portalUrl, type PortalTarget } from './domain';
import { Button, colors, Copy, IconButton, styles } from './ui';

export async function openExternal(url: string) {
  const policy = navigationPolicy(url);
  if (policy === 'blocked') { Alert.alert('Link unavailable', 'This link cannot be opened in the Bravo app.'); return; }
  try {
    if (policy === 'contact') await Linking.openURL(url);
    else await WebBrowser.openBrowserAsync(url, { toolbarColor: colors.bg, controlsColor: colors.gold });
  } catch { Alert.alert('Could not open this link', 'Try again or call Bravo at (605) 824-2767.'); }
}

export function Portal({ target, onClose }: { target: PortalTarget; onClose: () => void }) {
  const ref = useRef<WebView<object>>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const url = portalUrl(target.path);
  const closeOrBack = useCallback(() => canGoBack ? ref.current?.goBack() : onClose(), [canGoBack, onClose]);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => { closeOrBack(); return true; });
    return () => listener.remove();
  }, [closeOrBack]);

  const allowNavigation = (nextUrl: string) => {
    const policy = navigationPolicy(nextUrl);
    if (policy === 'internal') {
      // Broadcasting stays in the existing mobile browser flow; this companion requests no camera or microphone permissions.
      if (new URL(nextUrl).pathname === '/live/studio') { void openExternal(nextUrl); return false; }
      return true;
    }
    if (policy === 'external' || policy === 'contact') void openExternal(nextUrl);
    else if (nextUrl !== 'about:blank') Alert.alert('Open this feature on the website', 'Use the browser button for downloads or features that require your phone’s browser.');
    return false;
  };

  return <Modal visible animationType="slide" onRequestClose={closeOrBack} presentationStyle="fullScreen">
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.row, { paddingHorizontal: 8, borderBottomWidth: 1, borderColor: colors.line }]}>
        <IconButton name="chevron-left" label={canGoBack ? 'Previous page' : 'Close portal'} onPress={closeOrBack} />
        <View style={{ flex: 1, paddingVertical: 8 }}><Copy style={styles.strong}>{target.title}</Copy><Copy style={styles.small}>bravounleashed.com</Copy></View>
        <IconButton name="external-link" label="Open in browser" onPress={() => void openExternal(url)} />
        <IconButton name="x" label="Close portal" onPress={onClose} />
      </View>
      {Platform.OS === 'web' ? <View style={[styles.page, { flex: 1, justifyContent: 'center' }]}>
        <Copy>This preview opens your Bravo account in a browser. The iPhone and Android app has an integrated member portal.</Copy>
        <Button label={`Open ${target.title}`} onPress={() => void openExternal(url)} />
      </View> : <>
        {loading && !failed ? <View accessibilityRole="progressbar" accessibilityLabel="Loading Bravo" style={{ padding: 10 }}><ActivityIndicator color={colors.gold} /></View> : null}
        {failed ? <View style={[styles.page, { flex: 1, justifyContent: 'center' }]}><Copy>We couldn’t load this page. Check your connection and try again.</Copy><Button label="Try again" icon="refresh-cw" onPress={() => { setFailed(false); setLoading(true); }} /><Button secondary label="Open in browser" onPress={() => void openExternal(url)} /></View>
          : <WebView<object> ref={ref} source={{ uri: url }} style={{ flex: 1, backgroundColor: colors.bg }}
            originWhitelist={['*']} onShouldStartLoadWithRequest={request => allowNavigation(request.url)}
            onOpenWindow={event => { const next = event.nativeEvent.targetUrl; if (navigationPolicy(next) !== 'blocked') void openExternal(next); }}
            javaScriptEnabled domStorageEnabled sharedCookiesEnabled thirdPartyCookiesEnabled={false}
            mixedContentMode="never" allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
            allowsInlineMediaPlayback mediaPlaybackRequiresUserAction allowsBackForwardNavigationGestures
            onLoadStart={() => setLoading(true)} onLoadEnd={() => setLoading(false)}
            onError={() => { setFailed(true); setLoading(false); }}
            onHttpError={event => { if (event.nativeEvent.url === url && event.nativeEvent.statusCode >= 400) { setFailed(true); setLoading(false); } }}
            onContentProcessDidTerminate={() => ref.current?.reload()}
            onNavigationStateChange={state => setCanGoBack(state.canGoBack)} />}
      </>}
    </SafeAreaView>
  </Modal>;
}
