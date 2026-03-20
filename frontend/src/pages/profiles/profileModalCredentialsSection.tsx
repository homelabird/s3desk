import { Alert, Checkbox, Input, Typography } from 'antd'

import { FormField } from '../../components/FormField'
import styles from './ProfileModal.module.css'
import {
	countConfiguredValues,
	getCredentialsSummary,
	renderAdvancedFieldDisclosure,
	type ProfileModalSectionContentArgs,
} from './profileModalSectionShared'

export function buildCredentialsSection(args: ProfileModalSectionContentArgs) {
	const { values, errors, editMode, setField, viewState } = args

	return (
		<div className={styles.sectionBody}>
			<Typography.Text type="secondary" className={styles.sectionNote}>
				{editMode ? 'Leave credential fields blank to keep the existing stored values.' : 'Enter the auth material required by this provider.'}
			</Typography.Text>
			<Alert type="info" showIcon title="Credential fields" description={getCredentialsSummary(viewState, editMode)} />

			{viewState.isS3Provider ? (
				<>
					<div className={styles.formGrid}>
						<FormField label="Access Key ID" required={!editMode} error={errors.accessKeyId}>
							<Input
								value={values.accessKeyId}
								onChange={(e) => setField('accessKeyId', e.target.value)}
								autoComplete="username"
								aria-label="Access Key ID"
							/>
						</FormField>
						<FormField label="Secret" required={!editMode} error={errors.secretAccessKey}>
							<Input.Password
								value={values.secretAccessKey}
								onChange={(e) => setField('secretAccessKey', e.target.value)}
								autoComplete="new-password"
								aria-label="Secret"
							/>
						</FormField>
					</div>

					{renderAdvancedFieldDisclosure({
						title: 'Temporary credential extras',
						description: 'Open this only when the provider issued a session token on top of the access key and secret.',
						configuredCount: countConfiguredValues([values.sessionToken]),
						children: (
							<>
								<div className={styles.formGrid}>
									<FormField label="Session Token (optional)">
										<Input.Password
											value={values.sessionToken ?? ''}
											onChange={(e) => setField('sessionToken', e.target.value)}
											autoComplete="off"
											aria-label="Session Token (optional)"
											disabled={!!editMode && !!values.clearSessionToken}
										/>
									</FormField>
								</div>
								{editMode ? (
									<div className={styles.checkboxRow}>
										<Checkbox checked={!!values.clearSessionToken} onChange={(e) => setField('clearSessionToken', e.target.checked)}>
											Clear existing session token
										</Checkbox>
									</div>
								) : null}
							</>
						),
					})}
				</>
			) : null}

			{viewState.isAzure ? (
				<>
					<div className={styles.formGrid}>
						<FormField label="Account Key" required={!editMode} error={errors.azureAccountKey}>
							<Input.Password
								value={values.azureAccountKey}
								onChange={(e) => setField('azureAccountKey', e.target.value)}
								autoComplete="new-password"
								aria-label="Account Key"
							/>
						</FormField>
					</div>
					{renderAdvancedFieldDisclosure({
						title: 'Azure management-plane secret',
						description: 'Only open this when you are also filling the Azure ARM fields for management-plane features.',
						configuredCount: countConfiguredValues([values.azureClientSecret]),
						children: (
							<div className={styles.formGrid}>
								<FormField label="Client Secret (optional)" error={errors.azureClientSecret}>
									<Input.Password
										value={values.azureClientSecret}
										onChange={(e) => setField('azureClientSecret', e.target.value)}
										autoComplete="new-password"
										aria-label="Client Secret (optional)"
									/>
								</FormField>
							</div>
						),
					})}
				</>
			) : null}

			{viewState.isGcp ? (
				<>
					<div className={styles.toggleGrid}>
						{args.renderSwitchCard({
							title: 'Anonymous',
							description: 'Skip credentials and only use public access.',
							checked: values.gcpAnonymous,
							onChange: (checked) => setField('gcpAnonymous', checked),
							ariaLabel: 'Anonymous',
						})}
					</div>

					{values.gcpAnonymous ? (
						<Typography.Text type="secondary" className={styles.sectionNote}>
							Anonymous mode only works when the endpoint allows unauthenticated access. Project Number is still required.
						</Typography.Text>
					) : (
						<FormField label="Service Account JSON" required={!editMode} error={errors.gcpServiceAccountJson}>
							<Input.TextArea
								value={values.gcpServiceAccountJson}
								onChange={(e) => setField('gcpServiceAccountJson', e.target.value)}
								autoSize={{ minRows: 8, maxRows: 14 }}
								aria-label="Service Account JSON"
								placeholder={`{
  "type": "service_account_json",
  "project_id": "example-project",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n",
  "client_email": "example@project.iam.gserviceaccount.com"
}`}
							/>
						</FormField>
					)}
				</>
			) : null}

			{viewState.isOciObjectStorage ? (
				<>
					{renderAdvancedFieldDisclosure({
						title: 'OCI credential overrides',
						description: 'Open this only when you need a non-default auth provider or config path.',
						configuredCount: countConfiguredValues([values.ociAuthProvider, values.ociConfigFile, values.ociConfigProfile]),
						children: (
							<div className={styles.formGrid}>
								<FormField label="Auth Provider (optional)">
									<Input
										value={values.ociAuthProvider}
										onChange={(e) => setField('ociAuthProvider', e.target.value)}
										placeholder="user_principal_auth / instance_principal / api_key / resource_principal"
										aria-label="Auth Provider (optional)"
									/>
								</FormField>
								<FormField label="OCI Config File (optional)">
									<Input
										value={values.ociConfigFile}
										onChange={(e) => setField('ociConfigFile', e.target.value)}
										placeholder="/home/user/.oci/config"
										aria-label="OCI Config File (optional)"
									/>
								</FormField>
								<FormField label="OCI Config Profile (optional)">
									<Input
										value={values.ociConfigProfile}
										onChange={(e) => setField('ociConfigProfile', e.target.value)}
										placeholder="DEFAULT"
										aria-label="OCI Config Profile (optional)"
									/>
								</FormField>
							</div>
						),
					})}
				</>
			) : null}
		</div>
	)
}
