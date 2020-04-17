import * as React from 'react';
import { Linking } from 'react-native';

import ListItem from './ListItem';

export default class NoProjectTools extends React.Component {
  render() {
    return (
      <ListItem
        onPress={this._handlePressAsync}
        title="Get started with Expo"
        subtitle="Run projects from expo-cli or Snack."
      />
    );
  }

  _handlePressAsync = async () => {
    Linking.openURL('https://docs.expo.io/versions/latest/introduction/installation/');
  };
}
