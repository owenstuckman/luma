<script lang="ts">
  import type { FormQuestion } from '$lib/types';
  import Input from '$lib/components/card/Input.svelte';
  import InputDual from '$lib/components/card/InputDual.svelte';
  import InputArea from '$lib/components/card/InputArea.svelte';
  import Radio from '$lib/components/card/Radio.svelte';
  import Checkbox from '$lib/components/card/Checkbox.svelte';
  import CheckboxImage from '$lib/components/card/CheckboxImage.svelte';
  import Dropdown from '$lib/components/card/Dropdown.svelte';

  export let question: FormQuestion;
  export let storagePrefix: string = '';

  $: storageKey = storagePrefix ? `${storagePrefix}_${question.id}` : question.id;

  // State
  let stringVal: string = '';
  let arrayVal: string[] = [];
  let dualVal1: string = '';
  let dualVal2: string = '';

  import { onMount } from 'svelte';
  onMount(() => {
    if (question.type === 'checkbox' || question.type === 'checkbox_image') {
      const stored = localStorage.getItem(storageKey);
      arrayVal = stored ? stored.split(',').filter(Boolean) : [];
    } else if (question.type === 'input_dual') {
      dualVal1 = localStorage.getItem(`${storageKey}_1`) || '';
      dualVal2 = localStorage.getItem(`${storageKey}_2`) || '';
    } else {
      stringVal = localStorage.getItem(storageKey) || '';
    }
  });

  const handleStringChange = () => {
    localStorage.setItem(storageKey, stringVal);
  };

  const handleArrayChange = () => {
    localStorage.setItem(storageKey, arrayVal.join(','));
  };

  const handleDualChange = () => {
    localStorage.setItem(`${storageKey}_1`, dualVal1);
    localStorage.setItem(`${storageKey}_2`, dualVal2);
  };
</script>

{#if question.type === 'input'}
  <Input
    title={question.title}
    subtitle={question.subtitle || ''}
    id={question.id}
    bind:value={stringVal}
    on:change={handleStringChange}
  />
{:else if question.type === 'input_dual'}
  <InputDual
    title={question.title}
    subtitle={question.subtitle || ''}
    placeholder1={question.label1 || 'First'}
    placeholder2={question.label2 || 'Last'}
    bind:selected={dualVal1}
    bind:selected2={dualVal2}
    on:change={handleDualChange}
  />
{:else if question.type === 'textarea'}
  <InputArea
    title={question.title}
    subtitle={question.subtitle || ''}
    id={question.id}
    bind:value={stringVal}
    on:change={handleStringChange}
  />
{:else if question.type === 'radio'}
  <Radio
    title={question.title}
    subtitle={question.subtitle || ''}
    options={question.options || []}
    name={question.id}
    bind:selected={stringVal}
    on:change={handleStringChange}
  />
{:else if question.type === 'checkbox'}
  <Checkbox
    title={question.title}
    subtitle={question.subtitle || ''}
    options={question.options || []}
    name={question.id}
    bind:selected={arrayVal}
    on:change={handleArrayChange}
  />
{:else if question.type === 'checkbox_image'}
  <CheckboxImage
    title={question.title}
    subtitle={question.subtitle || ''}
    description={question.description || ''}
    options={question.options || []}
    name={question.id}
    imageSrc={question.imageSrc || ''}
    imageAlt={question.imageAlt || ''}
    linkName={question.linkName || ''}
    linkURL={question.linkURL || ''}
    bind:selected={arrayVal}
    on:change={handleArrayChange}
  />
{:else if question.type === 'dropdown'}
  <Dropdown
    title={question.title}
    subtitle={question.subtitle || ''}
    options={question.options || []}
    bind:selected={stringVal}
    on:change={handleStringChange}
  />
{/if}
