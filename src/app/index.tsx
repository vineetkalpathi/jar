import { StyleSheet, Text, View } from "react-native";

/**
 * Placeholder. The data layer beneath this — sync, filters, draws — is built and
 * tested; nothing renders it yet. The first real screen is sign-in.
 */
export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Jar</Text>
      <Text style={styles.subtitle}>Nothing to show yet.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 15,
    opacity: 0.6,
  },
});
