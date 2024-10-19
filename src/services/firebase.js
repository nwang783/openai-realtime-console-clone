import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, deleteDoc, doc, updateDoc, getDoc, getDocs, query, where, onSnapshot } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBPOdrVjBelqcAzlU29krs8zevSimnaJmY",
  authDomain: "the-dorm-box.firebaseapp.com",
  projectId: "the-dorm-box",
  storageBucket: "the-dorm-box.appspot.com",
  messagingSenderId: "603960178083",
  appId: "1:603960178083:web:aaa670d4a38b02756a9616",
  measurementId: "G-KZK3WZ4QBS"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
const db = getFirestore(app);

// Menu Item Functions

export const addMenuItem = async (name, price) => {
  try {
    const docRef = await addDoc(collection(db, 'menuItems'), {
      name,
      price: Number(price)
    });
    console.log("Menu item added with ID: ", docRef.id);
    return docRef.id;
  } catch (e) {
    console.error("Error adding menu item: ", e);
    throw e;
  }
};

export const removeMenuItem = async (name) => {
  try {
    const q = query(collection(db, 'menuItems'), where("name", "==", name));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      console.log("No menu item found with name: ", name);
      return false;
    }
    const docToDelete = querySnapshot.docs[0];
    await deleteDoc(doc(db, 'menuItems', docToDelete.id));
    console.log("Menu item removed: ", name);
    return true;
  } catch (e) {
    console.error("Error removing menu item: ", e);
    throw e;
  }
};

export const getMenuItems = async () => {
  try {
    const menuItemsCollection = collection(db, 'menuItems');
    const snapshot = await getDocs(menuItemsCollection);
    const items = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        price: data.price,
        defaultIngredients: Array.isArray(data.defaultIngredients) ? data.defaultIngredients : [],
        customizableIngredients: Array.isArray(data.customizableIngredients) ? data.customizableIngredients : []
      };
    });
    return items;
  } catch (error) {
    console.error("Error fetching menu items:", error);
    throw error;
  }
};

// Order Functions

export const createOrder = async () => {
  try {
    const orderData = {
      items: {},
      totalPrice: 0,
      timestamp: Date.now()
    };

    const docRef = await addDoc(collection(db, 'orders'), orderData);
    console.log("Order created with ID: ", docRef.id);
    return docRef.id;
  } catch (e) {
    console.error("Error creating order: ", e);
    throw e;
  }
};

export const addItemToOrder = async (orderId, itemName, modifications) => {
  try {
    const orderRef = doc(db, 'orders', orderId);
    const orderDoc = await getDoc(orderRef);
    
    if (!orderDoc.exists()) {
      throw new Error(`Order not found with ID: ${orderId}`);
    }

    const itemId = itemName.replace(/\s+/g, '').toLowerCase();

    const menuItemQuery = query(collection(db, 'menuItems'), where("id", "==", itemId));
    console.log(`Inputed name: ${itemName}`);
    const menuItemSnapshot = await getDocs(menuItemQuery);
    
    if (menuItemSnapshot.empty) {
      throw new Error(`Menu item not found: ${itemName}`);
    }

    const menuItem = menuItemSnapshot.docs[0].data();
    const updatedOrder = orderDoc.data();

    const orderItemId = `${itemName.replace(/\s+/g, '').toLowerCase()}${Date.now()}`;

    const newItem = {
      name: itemName,
      price: menuItem.price,
      quantity: 1,
      modifications: Array.isArray(modifications) ? modifications : modifications ? [modifications] : []
    };

    await updateDoc(orderRef, {
      [`items.${orderItemId}`]: newItem,
      totalPrice: updatedOrder.totalPrice + menuItem.price
    });

    console.log(`Added ${itemName} to order ${orderId}`);
    return itemId;
  } catch (e) {
    console.error("Error adding item to order: ", e);
    throw e;
  }
};

export const modifyItem = async (orderId, itemId, modifications, customInstructions) => {
  try {
    const orderRef = doc(db, 'orders', orderId);
    const orderDoc = await getDoc(orderRef);

    if (!orderDoc.exists()) {
      throw new Error(`Order not found with orderId: ${orderId}`);
    }

    const updatedOrder = orderDoc.data();

    if (!updatedOrder.items[itemId]) {
      throw new Error(`Item not found with itemId: ${itemId}`);
    }

    const modificationId = `mod${Date.now()}`;
    const modification = {
      ...modifications,
      timestamp: Date.now()
    };

    // Only add customInstructions if it's defined and not an empty string
    if (customInstructions && customInstructions.trim() !== '') {
      modification.customInstructions = customInstructions.trim();
    }

    // Ensure we're not setting an empty object
    if (Object.keys(modification).length > 1) { // > 1 because timestamp will always be there
      await updateDoc(orderRef, {
        [`items.${itemId}.modifications.${modificationId}`]: modification
      });

      console.log(`Modified item ${itemId} in order ${orderId}`);
      return modificationId;
    } else {
      console.log(`No modifications to apply for item ${itemId} in order ${orderId}`);
      return null;
    }
  } catch (error) {
    console.error('Error modifying item: ', error);
    throw error;
  }
};

export const removeItemFromOrder = async (orderId, itemId) => {
  try {
    const orderRef = doc(db, 'orders', orderId);
    const orderDoc = await getDoc(orderRef);
    
    if (!orderDoc.exists()) {
      throw new Error(`Order not found with ID: ${orderId}`);
    }

    const updatedOrder = orderDoc.data();

    if (!updatedOrder.items[itemId]) {
      throw new Error(`Item not found in order: ${itemId}`);
    }

    const removedItemPrice = updatedOrder.items[itemId].price;
    const newTotalPrice = updatedOrder.totalPrice - removedItemPrice;

    // Remove the item and update the total price
    await updateDoc(orderRef, {
      [`items.${itemId}`]: null,  // This will remove the field
      totalPrice: newTotalPrice
    });

    console.log(`Removed item ${itemId} from order ${orderId}`);
    return true;
  } catch (e) {
    console.error("Error removing item from order: ", e);
    throw e;
  }
};

export const getOrder = async (orderId) => {
  try {
    const orderDoc = await getDoc(doc(db, 'orders', orderId));
    if (!orderDoc.exists()) {
      throw new Error(`Order not found with ID: ${orderId}`);
    }
    return { id: orderDoc.id, ...orderDoc.data() };
  } catch (e) {
    console.error("Error getting order: ", e);
    throw e;
  }
};

export const listenToOrder = (orderId, callback) => {
  const orderRef = doc(db, 'orders', orderId);
  return onSnapshot(orderRef, (doc) => {
    if (doc.exists()) {
      callback(doc.data());
    } else {
      console.log("No such order!");
    }
  });
};

export { db };
