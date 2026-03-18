import { useState, useRef, useEffect } from 'react';
import { View, Text, Animated, StyleProp, TextStyle } from 'react-native';
import { Spacing } from '../../constants/theme';

interface MarqueeTitleProps {
  text: string;
  style: StyleProp<TextStyle>;
}

export function MarqueeTitle({ text, style }: MarqueeTitleProps) {
  const scrollAnim = useRef(new Animated.Value(0)).current;
  const [containerW, setContainerW] = useState(0);
  const [textW, setTextW] = useState(0);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  const overflow = textW - containerW;

  useEffect(() => {
    if (animRef.current) animRef.current.stop();
    scrollAnim.setValue(0);
    if (overflow <= 2) return;
    const duration = (overflow / 30) * 1000;
    const loop = () => {
      scrollAnim.setValue(0);
      animRef.current = Animated.sequence([
        Animated.delay(1500),
        Animated.timing(scrollAnim, { toValue: -overflow, duration, useNativeDriver: true }),
        Animated.delay(2000),
        Animated.timing(scrollAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]);
      animRef.current.start(({ finished }) => { if (finished) loop(); });
    };
    loop();
    return () => { if (animRef.current) animRef.current.stop(); };
  }, [overflow, text]);

  return (
    <View
      style={{ flex: 1, overflow: 'hidden', marginRight: Spacing.sm }}
      onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}
    >
      <Text
        style={[style, { position: 'absolute', opacity: 0, flex: undefined, width: 9999 }]}
        numberOfLines={1}
        onTextLayout={(e) => {
          const w = e.nativeEvent.lines[0]?.width ?? 0;
          if (Math.abs(w - textW) > 1) setTextW(w);
        }}
      >
        {text}
      </Text>
      <Animated.Text
        style={[style, { flex: undefined, marginRight: undefined, transform: [{ translateX: scrollAnim }] }]}
        numberOfLines={1}
      >
        {text}
      </Animated.Text>
    </View>
  );
}
