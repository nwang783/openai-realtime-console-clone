import React, { useEffect, useRef, useCallback, useState } from 'react';
import { RealtimeClient } from '@openai/realtime-api-beta';
import { ItemType } from '@openai/realtime-api-beta/dist/lib/client.js';
import { WavRecorder, WavStreamPlayer } from '../lib/wavtools/index.js';
import { instructions } from '../utils/conversation_config.js';
import { X, Zap } from 'react-feather';
import { Button } from '../components/button/Button';
import { Toggle } from '../components/toggle/Toggle';
import './ConsolePage.scss';
import { db, getOrder, modifyItem, createOrder, addItemToOrder, removeItemFromOrder, getMenuItems, listenToOrder } from '../services/firebase';
import { collection, getDocs, addDoc, query, where, updateDoc, doc } from 'firebase/firestore';
import defaultMenuItems from '../components/menuItems.js';

const LOCAL_RELAY_SERVER_URL: string = process.env.REACT_APP_LOCAL_RELAY_SERVER_URL || '';

type CreateOrderResult = {
  success: boolean;
  orderId?: string;
  message?: string;
  error?: string;
};

type AddRemoveItemResult = {
  success: boolean;
  message?: string;
  error?: string;
};

interface MenuItem {
  id: string;
  name: string;
  price: number;
  defaultIngredients: string[];
  customizableIngredients: string[];
}

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  modifications?: Record<string, any>; 
}

interface FirestoreOrder {
  items: Record<string, OrderItem>;
  totalPrice: number;
  quantity: number;
}

interface ModifyItemResult {
  items: {
    success: boolean;
    message?: string;
    error?: string;
  }[];
}

export function ConsolePage() {
  const apiKey = LOCAL_RELAY_SERVER_URL
    ? ''
    : localStorage.getItem('tmp::voice_api_key') || prompt('OpenAI API Key') || '';
  if (apiKey !== '') {
    localStorage.setItem('tmp::voice_api_key', apiKey);
  }

  const wavRecorderRef = useRef<WavRecorder>(new WavRecorder({ sampleRate: 24000 }));
  const wavStreamPlayerRef = useRef<WavStreamPlayer>(new WavStreamPlayer({ sampleRate: 24000 }));
  const clientRef = useRef<RealtimeClient>(
    new RealtimeClient(
      LOCAL_RELAY_SERVER_URL
        ? { url: LOCAL_RELAY_SERVER_URL }
        : {
            apiKey: apiKey,
            dangerouslyAllowAPIKeyInBrowser: true,
          }
    )
  );

  const [items, setItems] = useState<ItemType[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [canPushToTalk, setCanPushToTalk] = useState<boolean>(true);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [functionLogs, setFunctionLogs] = useState<Array<{name: string, input: any, output: any}>>([]);

  const logFunctionCall = (name: string, input: any, output: any) => {
    setFunctionLogs(prevLogs => [...prevLogs, { name, input, output }]);
  };

  const connectConversation = useCallback(async () => {
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;

    setIsConnected(true);
    setItems(client.conversation.getItems());

    await wavRecorder.begin();
    await wavStreamPlayer.connect();
    await client.connect();

    if (client.getTurnDetectionType() === 'server_vad') {
      await wavRecorder.record((data) => client.appendInputAudio(data.mono));
    }
  }, []);

  const disconnectConversation = useCallback(async () => {
    setIsConnected(false);
    // setItems([]);
    // setOrderItems([]);

    const client = clientRef.current;
    client.disconnect();

    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.end();

    const wavStreamPlayer = wavStreamPlayerRef.current;
    await wavStreamPlayer.interrupt();
  }, []);

  const startRecording = async () => {
    setIsRecording(true);
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;
    const trackSampleOffset = await wavStreamPlayer.interrupt();
    if (trackSampleOffset?.trackId) {
      const { trackId, offset } = trackSampleOffset;
      await client.cancelResponse(trackId, offset);
    }
    await wavRecorder.record((data) => client.appendInputAudio(data.mono));
  };

  const stopRecording = async () => {
    setIsRecording(false);
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.pause();
    client.createResponse();
  };

  const changeTurnEndType = async (value: string) => {
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    if (value === 'none' && wavRecorder.getStatus() === 'recording') {
      await wavRecorder.pause();
    }
    client.updateSession({
      turn_detection: value === 'none' ? null : { type: 'server_vad' },
    });
    if (value === 'server_vad' && client.isConnected()) {
      await wavRecorder.record((data) => client.appendInputAudio(data.mono));
    }
    setCanPushToTalk(value === 'none');
  };

  // useEffect for uploading menu itmes to firebase
  useEffect(() => {
    const uploadMissingMenuItems = async () => {
      const menuItemsCollection = collection(db, 'menuItems');

      for (const item of defaultMenuItems) {
        // Check if the item already exists in the database
        const q = query(menuItemsCollection, where("id", "==", item.id));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          // Item doesn't exist, so add it
          try {
            await addDoc(menuItemsCollection, {
              id: item.id,
              name: item.name,
              price: item.price,
              defaultIngredients: item.defaultIngredients,
              customizableIngredients: item.customizableIngredients
            });
            console.log(`Added menu item: ${item.name}`);
          } catch (error) {
            console.error(`Error adding menu item ${item.name}:`, error);
          }
        // } else {
        //   // Item exists, update it to ensure all fields are current
        //   const existingDoc = querySnapshot.docs[0];
        //   try {
        //     await updateDoc(doc(db, 'menuItems', existingDoc.id), {
        //       name: item.name,
        //       price: item.price,
        //       defaultIngredients: item.defaultIngredients,
        //       customizableIngredients: item.customizableIngredients
        //     });
        //     console.log(`Updated menu item: ${item.name}`);
        //   } catch (error) {
        //     console.error(`Error updating menu item ${item.name}:`, error);
        //   }
        }
      }
    };

    uploadMissingMenuItems();
  }, []); 

   // New useEffect for setting up the order listener
   useEffect(() => {
    let unsubscribe: (() => void) | undefined;
  
    if (orderId) {
      unsubscribe = listenToOrder(orderId, (updatedOrder: FirestoreOrder | null) => {
        if (updatedOrder && updatedOrder.items) {
          const updatedOrderItems: OrderItem[] = Object.entries(updatedOrder.items).map(([id, item]) => ({
            id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            modifications: item.modifications
          }));
          setOrderItems(updatedOrderItems);
        }
      });
    }
  
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [orderId]);

  useEffect(() => {
    const wavStreamPlayer = wavStreamPlayerRef.current;
    const client = clientRef.current;

    client.updateSession({ instructions: instructions });
    client.updateSession({ input_audio_transcription: { model: 'whisper-1' } });

    client.addTool(
      {
        name: 'create_order',
        description: 'Creates a new order for the customer',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      async (): Promise<CreateOrderResult> => {
        try {
          const newOrderId = await createOrder();
          setOrderId(newOrderId);
          const result = { success: true, orderId: newOrderId, message: `Created new order with ID: ${newOrderId}` };
          logFunctionCall('create_order', {}, result);
          return result;
        } catch (error) {
          const result = { success: false, error: (error as Error).message };
          logFunctionCall('create_order', {}, result);
          return result;
        }
      }
    );

    client.addTool(
      {
        name: 'add_item_to_order',
        description: 'Adds an item to an existing order',
        parameters: {
          type: 'object',
          properties: {
            orderId: { type: 'string', description: 'ID of the order' },
            itemName: { type: 'string', description: 'Name of the item to add. Capitalize the first letter of each word.' },
            modifications: { type: 'string', description: 'If the user requests a modification to the item, input it here. You must choose one of NO, EX, or LITE, followed by the ingredient.'}
          },
          required: ['orderId', 'itemName'],
        },
      },
      async ({ orderId, itemName, modifications }: { orderId: string; itemName: string; modifications: string; }): Promise<AddRemoveItemResult> => {
        try {
          const itemId = modifications ? await addItemToOrder(orderId, itemName, modifications) : await addItemToOrder(orderId, itemName)
          const result = { success: true, message: `Added ${itemName}: ${itemId} to order ${orderId}` };
          logFunctionCall('add_item', {orderId, itemName, modifications}, result);
          return result;
        } catch (error) {
          const result = { success: false, error: (error as Error).message };
          logFunctionCall('add_item', {orderId, itemName, modifications}, result);
          return result;
        }
      }
    );

    client.addTool(
      {
        name: 'remove_item_from_order',
        description: 'Removes an item from an existing order',
        parameters: {
          type: 'object',
          properties: {
            orderId: { type: 'string', description: 'ID of the order' },
            itemId: { type: 'string', description: 'ID of the item to remove' },
          },
          required: ['orderId', 'itemId'],
        },
      },
      async ({ orderId, itemId }: { orderId: string; itemId: string }): Promise<AddRemoveItemResult> => {
        try {
          await removeItemFromOrder(orderId, itemId);
          const result = { success: true, message: `Removed ${itemId} from order ${orderId}` };
          logFunctionCall('remove_item', {orderId, itemId}, result);
          return result;
        } catch (error) {
          const result = { success: false, error: (error as Error).message };
          logFunctionCall('remove_item', {orderId, itemId}, result);
          return result;
        }
      }
    );

    client.addTool(
      {
        name: 'modify_item_in_order',
        description: '',
        parameters: {
          type: 'object',
          properties: {
            orderId: { type: 'string', description: 'ID of the order' },
            itemId: { type: 'string', description: 'This is a unique identifier for each item in the order.'},
            modifications: { type: 'string', description: 'Ingredient to modify and the modifier. You MUST use on of these modifiers: NO, LITE, or EX. (e.g. EX ketchup).'},
          },
          required: ['orderId', 'itemId', 'modifications'],
        }
      },
      async ({ orderId, itemId, modifications, custom_instructions }: {orderId: string; itemId: string; modifications: string; custom_instructions: string }) => {
        try {
          if (modifications && custom_instructions) {
            const result = await modifyItem(orderId, itemId, modifications, custom_instructions)
            logFunctionCall('modify_item', {orderId, itemId, modifications, custom_instructions}, result)
            return result;
          }
          else if (modifications && !custom_instructions) {
            const result = await modifyItem(orderId, itemId, modifications)
            logFunctionCall('modify_item', {orderId, itemId, modifications}, result)
            return result;
          }
          else {
            const result = await modifyItem(orderId, itemId, custom_instructions)
            logFunctionCall('modify_item', {orderId, itemId, custom_instructions}, result)
            return result;
          }
        } catch (error) {
          const result = { success: false, error: (error as Error).message };
          logFunctionCall('modify_item', {orderId, itemId, modifications}, result);
          return result;
        }
      },
    );

    client.addTool(
      {
        name: 'get_order_details',
        description: 'Get the details of the items in the current order',
        parameters: {
          type: 'object',
          properties: {
            orderId: {type: 'string', descrtiption: 'ID of the order'},
          },
          required: ['orderId'],
        }
      },
      async ({ orderId } : {orderId: string}) => {
        try {
          const result = await getOrder(orderId);
          logFunctionCall('get_order', {orderId}, result);
          return result;
        } catch (error) {
          const result = { success: false, error: (error as Error).message };
          logFunctionCall('get_order', {orderId}, result);
          return result;
        }
      }
    );

    client.on('conversation.interrupted', async () => {
      const trackSampleOffset = await wavStreamPlayer.interrupt();
      if (trackSampleOffset?.trackId) {
        const { trackId, offset } = trackSampleOffset;
        await client.cancelResponse(trackId, offset);
      }
    });

    client.on('conversation.updated', async ({ item, delta }: any) => {
      const items = client.conversation.getItems();
      if (delta?.audio) {
        wavStreamPlayer.add16BitPCM(delta.audio, item.id);
      }
      if (item.status === 'completed' && item.formatted.audio?.length) {
        const wavFile = await WavRecorder.decode(item.formatted.audio, 24000, 24000);
        item.formatted.file = wavFile;
      }
      setItems(items);
    });

    setItems(client.conversation.getItems());

    const fetchMenuItems = async () => {
      try {
        const items = await getMenuItems();
        console.log("Fetched menu items:", items);
        const typedItems: MenuItem[] = items.map(item => ({
          id: item.id,
          name: item.name,
          price: item.price,
          defaultIngredients: Array.isArray(item?.defaultIngredients) ? item.defaultIngredients : [],
          customizableIngredients: Array.isArray(item?.customizableIngredients) ? item.customizableIngredients : [],
        }));
        console.log("Typed menu items:", typedItems);
        setMenuItems(typedItems);
      } catch (error) {
        console.error("Error fetching menu items:", error);
      }
    };

    fetchMenuItems();

    return () => {
      client.reset();
    };
  }, []);

  return (
    <div className="console-page">
      <main className="main-content">
        <section className="conversation-section">
          <h2>Conversation</h2>
          <div className="conversation-log">
            {!isConnected && <p>Awaiting connection...</p>}
            {items.map((item) => (
              <div key={item.id} className={`conversation-item ${item.role}`}>
                <span className="speaker">{item.role}:</span>
                <div className="message">
                  {item.formatted.text || item.formatted.transcript}
                  {item.formatted.tool && (
                    <div className="function-call">
                      Function Call: {item.formatted.tool.name}(
                      {JSON.stringify(item.formatted.tool.arguments)})
                    </div>
                  )}
                  {item.type === 'function_call_output' && (
                    <div className="function-output">
                      Function Output: {item.formatted.output}
                    </div>
                  )}
                  {item.formatted.file && (
                    <audio src={item.formatted.file.url} controls />
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="conversation-controls">
            <Toggle
              defaultValue={false}
              labels={['manual', 'vad']}
              values={['none', 'server_vad']}
              onChange={(_, value) => changeTurnEndType(value)}
            />
            {isConnected && canPushToTalk && (
              <Button
                label={isRecording ? 'Release to send' : 'Push to talk'}
                buttonStyle={isRecording ? 'alert' : 'regular'}
                disabled={!isConnected || !canPushToTalk}
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
              />
            )}
            <Button
              label={isConnected ? 'Disconnect' : 'Connect'}
              icon={isConnected ? X : Zap}
              buttonStyle={isConnected ? 'regular' : 'action'}
              onClick={isConnected ? disconnectConversation : connectConversation}
            />
          </div>
        </section>
        <section className="menu-section">
        <h2>Menu</h2>
        <div className="menu-grid">
          {menuItems.length === 0 ? (
            <p>Loading menu items...</p>
          ) : (
            menuItems.map((item) => (
              <div key={item.id} className="menu-item">
                <div className="item-image-placeholder"></div>
                <h3>{item.name}</h3>
                <p>${item.price.toFixed(2)}</p>
              </div>
            ))
          )}
        </div>
      </section>
      <section className="order-section">
        <h2>Current Order</h2>
        <div className="order-items">
          {orderItems.map((item) => (
            <div key={item.id} className="order-item">
              <div className="item-details">
                <span className="item-name">{item.name}</span>
                <span className="item-price">${(item.price * item.quantity).toFixed(2)}</span>
              </div>
              {item.modifications && item.modifications.length > 0 && (
                    <div className="item-modifications">
                      {item.modifications.map((mod: string, index: number) => (
                        <span key={index} className="modification">
                          {mod}
                        </span>
                      ))}
                    </div>
                  )}
            </div>
          ))}
        </div>
        <div className="order-total">
          <h3>Total: ${orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2)}</h3>
        </div>
      </section>
      </main>
    </div>
  );
}
