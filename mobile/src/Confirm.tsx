import React from 'react';
import { Modal, View } from 'react-native';
import { Button, Card, Copy, Heading } from './ui';

export type Confirmation = { title: string; detail: string; action: string; confirm: () => void };
export function Confirm({ request, onCancel }: { request: Confirmation; onCancel: () => void }) {
  return <Modal transparent visible animationType="fade" onRequestClose={onCancel}>
    <View style={{ flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.8)', padding: 24 }}>
      <Card><Heading small>{request.title}</Heading><Copy>{request.detail}</Copy>
        <Button label={request.action} icon="check" onPress={() => { onCancel(); request.confirm(); }} />
        <Button secondary label="Keep editing" icon="x" onPress={onCancel} />
      </Card>
    </View>
  </Modal>;
}
