/* @flow */

import * as React from 'react';
import { StyleSheet, Text, TouchableHighlight, View } from 'react-native';
import { connect } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';

import Colors from '../constants/Colors';
import SharedStyles from '../constants/SharedStyles';
import SessionActions from '../redux/SessionActions';
import SettingsActions from '../redux/SettingsActions';
import ScrollView from '../components/NavigationScrollView';
import { SectionLabelContainer, GenericCardBody, GenericCardContainer } from '../components/Views';
import { SectionLabelText, GenericCardTitle } from '../components/Text';
import ListItem from '../components/ListItem'

@connect(data => UserSettingsScreen.getDataProps(data))
export default class UserSettingsScreen extends React.Component {
  static navigationOptions = {
    title: 'Options',
  };

  static getDataProps(data) {
    let { settings } = data;

    return {
      preferredAppearance: settings.preferredAppearance,
    };
  }

  render() {
    return (
      <ScrollView
        style={styles.container}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag">
        {this._renderAppearanceOptions()}
        <ListItem
          style={{ marginTop: 30 }}
          title='Sign Out'
          onPress={this._handlePressSignOut} />
      </ScrollView>
    );
  }

  _handlePressSignOut = () => {
    this.props.dispatch(SessionActions.signOut());
    requestAnimationFrame(this.props.navigation.pop);
  };

  _setPreferredAppearance = (preferredAppearance: 'light' | 'dark' | 'automatic') => {
    this.props.dispatch(SettingsActions.setPreferredAppearance(preferredAppearance));
  };

  _renderAppearanceOptions() {
    const { preferredAppearance } = this.props;

    return (
      <View style={{ marginTop: 25 }}>
        <SectionLabelContainer>
          <SectionLabelText>THEME</SectionLabelText>
        </SectionLabelContainer>
        <ListItem
          last={false}
          title='Automatic'
          checked={preferredAppearance === 'no-preference'}
          onPress={() => this._setPreferredAppearance('no-preference')}/>
        <ListItem
          last={false}
          title='Light'
          checked={preferredAppearance === 'light'}
          onPress={() => this._setPreferredAppearance('light')} />
        <ListItem
          last={true}
          margins={false}
          title='Dark'
          checked={preferredAppearance === 'dark'}
          onPress={() => this._setPreferredAppearance('dark')}/>
        <View style={SharedStyles.genericCardDescriptionContainer}>
          <Text style={SharedStyles.genericCardDescriptionText}>
            Automatic is only supported on operating systems that allow you to control the
            system-wide color scheme.
          </Text>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  cardBody: {
    paddingTop: 15,
    paddingLeft: 15,
    paddingRight: 10,
    paddingBottom: 12,
  },
  cardIconRight: {
    position: 'absolute',
    right: 20,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
});
