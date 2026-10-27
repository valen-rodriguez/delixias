import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

export const useKeyboardBottomInset = () => {
  const [bottomInset, setBottomInset] = useState(0);

  useEffect(() => {
    const showListener = Keyboard.addListener('keyboardDidShow', (event) => {
      setBottomInset(event.endCoordinates.height);
    });
    const hideListener = Keyboard.addListener('keyboardDidHide', () => {
      setBottomInset(0);
    });

    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, []);

  return bottomInset;
};
