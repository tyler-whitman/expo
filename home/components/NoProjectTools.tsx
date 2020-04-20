import * as React from 'react';
import { Linking } from 'react-native';

import ListItem from './ListItem';

export default class NoProjectTools extends React.Component {
  render() {
    return (
      <ListItem
        title="Get started with Expo"
        subtitle="Run projects from expo-cli or Snack."
        onPress={this._handlePressAsync}
        last
      />
    );
  }

  _handlePressAsync = async () => {
    Linking.openURL('https://docs.expo.io/versions/latest/introduction/installation/');
  };
}
