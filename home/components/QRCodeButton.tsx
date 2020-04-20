import * as React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { withNavigation } from 'react-navigation';

import requestCameraPermissionsAsync from '../utils/requestCameraPermissionsAsync';
import ListItem from './ListItem';

@withNavigation
export default class QRCodeButton extends React.Component {
  render() {
    return (
      <ListItem
        icon={Platform.OS === 'ios' ? 'ios-qr-scanner' : 'md-qr-scanner'}
        iconStyle={styles.icon}
        title="Scan QR Code"
        subtitle="Open your projects without typing"
        onPress={this._handlePressAsync}
        last
      />
    );
  }

  _handlePressAsync = async () => {
    if (await requestCameraPermissionsAsync()) {
      this.props.navigation.navigate('QRCode');
    } else {
      alert('In order to use the QR Code scanner you need to provide camera permissions');
    }
  };
}

const styles = StyleSheet.create({
  icon: {
    fontSize: 28,
  },
});
