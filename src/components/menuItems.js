const defaultMenuItems = [
    {
      id: 'burger',
      name: 'Burger',
      price: 6.99,
      defaultIngredients: ['bun', 'patty', 'cheese', 'lettuce', 'tomato', 'pickles', 'onions', 'ketchup', 'mustard'],
      customizableIngredients: ['cheese', 'lettuce', 'tomato', 'pickles', 'onions', 'ketchup', 'mustard']
    },
    {
      id: 'fries',
      name: 'Fries',
      price: 2.99,
      defaultIngredients: ['potatoes', 'salt'],
      customizableIngredients: ['salt']
    },
    {
      id: 'hotdog',
      name: 'Hot Dog',
      price: 4.99,
      defaultIngredients: ['bun', 'sausage', 'ketchup', 'mustard', 'onions', 'relish'],
      customizableIngredients: ['ketchup', 'mustard', 'onions', 'relish']
    },
    {
      id: 'soda',
      name: 'Soda',
      price: 1.99,
      defaultIngredients: ['carbonated water', 'syrup', 'ice'],
      customizableIngredients: ['ice']
    }
  ];

export default defaultMenuItems;
