import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import { font } from '@/lib/theme';

export type TemplateId = 'story' | 'square' | 'review' | 'voucher';

export const TEMPLATES: { id: TemplateId; label: string; ratio: number; perSaleOnly?: boolean }[] = [
  { id: 'story', label: 'Story 9:16', ratio: 9 / 16 },
  { id: 'square', label: 'Square post', ratio: 1 },
  { id: 'review', label: 'Review card', ratio: 4 / 5 },
  { id: 'voucher', label: 'Voucher card', ratio: 4 / 5, perSaleOnly: true },
];

export interface TemplateProps {
  width: number;
  logoUri: string | null;
  photoUri: string | null;
  colors: [string, string];
  brandName: string;
  brandTag: string;
  headline: string;
  rating: number;
  handle: string;
  voucher: string | null;
}

/** Required on every template: the creator can't remove the paid-partnership disclosure. */
function Disclosure({ brandName, scale, style }: { brandName: string; scale: number; style?: object }) {
  return (
    <View style={[{ backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 12 * scale, paddingVertical: 6 * scale, alignSelf: 'flex-start' }, style]}>
      <Text style={{ color: '#111', fontFamily: font.semibold, fontSize: 12 * scale }}>#ad · Paid partnership with {brandName}</Text>
    </View>
  );
}

function Logo({ uri, size }: { uri: string | null; size: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {uri ? <Image source={{ uri }} style={{ width: size * 0.82, height: size * 0.82 }} contentFit="contain" /> : null}
    </View>
  );
}

function Photo({ uri, style }: { uri: string | null; style: object }) {
  return uri ? <Image source={{ uri }} style={style} contentFit="cover" /> : <View style={[style, { backgroundColor: '#1A1A24' }]} />;
}

export function Story(p: TemplateProps) {
  const s = p.width / 360;
  return (
    <View style={{ width: p.width, height: p.width / (9 / 16), backgroundColor: '#000' }}>
      <Photo uri={p.photoUri} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.8)']} locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} />
      <View style={{ position: 'absolute', top: 24 * s, left: 20 * s, flexDirection: 'row', alignItems: 'center', gap: 8 * s, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 999, paddingRight: 14 * s, padding: 4 * s }}>
        <Logo uri={p.logoUri} size={30 * s} />
        <Text style={{ color: '#111', fontFamily: font.semibold, fontSize: 13 * s }}>{p.brandName}</Text>
      </View>
      <View style={{ position: 'absolute', left: 22 * s, right: 22 * s, bottom: 34 * s, gap: 10 * s }}>
        <Text style={{ color: '#fff', fontFamily: font.display, fontSize: 36 * s, lineHeight: 40 * s, letterSpacing: -0.8 * s }}>{p.headline}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.85)', fontFamily: font.medium, fontSize: 15 * s }}>{p.brandTag}</Text>
        <Disclosure brandName={p.brandName} scale={s} />
      </View>
    </View>
  );
}

export function Square(p: TemplateProps) {
  const s = p.width / 360;
  return (
    <LinearGradient colors={p.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: p.width, height: p.width, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', width: 260 * s, height: 260 * s, borderRadius: 130 * s, backgroundColor: 'rgba(255,255,255,0.14)', right: -70 * s, top: -90 * s }} />
      <View style={{ position: 'absolute', top: 18 * s, left: 18 * s }}>
        <Logo uri={p.logoUri} size={44 * s} />
      </View>
      <View style={{ position: 'absolute', top: 54 * s, left: 70 * s, width: 210 * s, height: 210 * s, transform: [{ rotate: '-4deg' }], backgroundColor: '#fff', padding: 8 * s, borderRadius: 6 * s }}>
        <Photo uri={p.photoUri} style={{ flex: 1, borderRadius: 3 * s }} />
        <View style={{ position: 'absolute', top: -10 * s, left: 70 * s, width: 70 * s, height: 22 * s, backgroundColor: 'rgba(255,255,255,0.7)', transform: [{ rotate: '6deg' }] }} />
      </View>
      <View style={{ position: 'absolute', top: 24 * s, right: 16 * s, transform: [{ rotate: '8deg' }] }}>
        <Disclosure brandName={p.brandName} scale={s * 0.85} />
      </View>
      <View style={{ position: 'absolute', left: 20 * s, right: 20 * s, bottom: 16 * s }}>
        <Text numberOfLines={2} style={{ color: '#fff', fontFamily: font.display, fontSize: 26 * s, lineHeight: 29 * s, letterSpacing: -0.5 * s }}>
          {p.headline}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.9)', fontFamily: font.medium, fontSize: 12 * s, marginTop: 4 * s }}>{p.brandTag}</Text>
      </View>
    </LinearGradient>
  );
}

export function Review(p: TemplateProps) {
  const s = p.width / 360;
  const h = p.width / (4 / 5);
  return (
    <View style={{ width: p.width, height: h, backgroundColor: p.colors[1] }}>
      <Photo uri={p.photoUri} style={{ width: p.width, height: h * 0.58 }} />
      <View style={{ position: 'absolute', left: 16 * s, right: 16 * s, bottom: 16 * s, backgroundColor: '#fff', borderRadius: 22 * s, padding: 18 * s, gap: 8 * s }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', gap: 3 * s }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <SymbolView key={n} name={n <= p.rating ? 'star.fill' : 'star'} tintColor="#F59E0B" size={18 * s} />
            ))}
          </View>
          <Logo uri={p.logoUri} size={34 * s} />
        </View>
        <Text style={{ color: '#111', fontFamily: font.display, fontSize: 22 * s, lineHeight: 26 * s, letterSpacing: -0.4 * s }}>“{p.headline}”</Text>
        <Text style={{ color: '#555', fontFamily: font.medium, fontSize: 13 * s }}>
          @{p.handle} · {p.brandTag}
        </Text>
        <Disclosure brandName={p.brandName} scale={s * 0.9} style={{ backgroundColor: '#F3F4F6' }} />
      </View>
    </View>
  );
}

export function Voucher(p: TemplateProps) {
  const s = p.width / 360;
  const h = p.width / (4 / 5);
  return (
    <LinearGradient colors={p.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: p.width, height: h, alignItems: 'center', paddingTop: 22 * s }}>
      <Logo uri={p.logoUri} size={46 * s} />
      <View style={{ marginTop: 14 * s, width: 170 * s, height: 170 * s, borderRadius: 85 * s, borderWidth: 6 * s, borderColor: '#fff', overflow: 'hidden' }}>
        <Photo uri={p.photoUri} style={{ flex: 1 }} />
      </View>
      <Text style={{ color: '#fff', fontFamily: font.display, fontSize: 24 * s, marginTop: 14 * s, textAlign: 'center', paddingHorizontal: 20 * s }}>{p.headline}</Text>
      <View style={{ marginTop: 12 * s, backgroundColor: '#fff', borderRadius: 16 * s, paddingVertical: 10 * s, paddingHorizontal: 22 * s, alignItems: 'center', borderWidth: 2 * s, borderStyle: 'dashed', borderColor: p.colors[1] }}>
        <Text style={{ color: '#555', fontFamily: font.medium, fontSize: 11 * s, letterSpacing: 1 * s }}>USE MY CODE</Text>
        <Text style={{ color: '#111', fontFamily: font.display, fontSize: 28 * s, letterSpacing: 2 * s }}>{p.voucher ?? 'KOLAB-CODE'}</Text>
      </View>
      <View style={{ position: 'absolute', bottom: 16 * s }}>
        <Disclosure brandName={p.brandName} scale={s} />
      </View>
    </LinearGradient>
  );
}

export const RENDER: Record<TemplateId, (p: TemplateProps) => React.JSX.Element> = { story: Story, square: Square, review: Review, voucher: Voucher };
